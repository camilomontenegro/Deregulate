import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface GridCell {
  x: number;
  y: number;
  centerLat: number;
  centerLng: number;
  buildingCount: number;
  totalApartments: number;
  avgApartments: number;
  avgConstructionYear: number | null;
  residentialCount: number;
  densityScore: number;
}

interface CityBounds {
  north: number;
  south: number; 
  east: number;
  west: number;
}

// Predefined city bounds for efficient querying
const CITY_BOUNDS: { [key: string]: CityBounds } = {
  sevilla: {
    north: 37.45,
    south: 37.32,
    east: -5.85,
    west: -6.05
  },
  madrid: {
    north: 40.50,
    south: 40.35,
    east: -3.60,
    west: -3.80
  },
  barcelona: {
    north: 41.45,
    south: 41.32,
    east: 2.25,
    west: 2.05
  }
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Parse parameters
  const city = searchParams.get('city')?.toLowerCase() || 'sevilla';
  const gridSize = parseInt(searchParams.get('gridSize') || '40');
  
  // Validate parameters
  if (!CITY_BOUNDS[city]) {
    return NextResponse.json(
      { error: `Unsupported city. Available: ${Object.keys(CITY_BOUNDS).join(', ')}` },
      { status: 400 }
    );
  }
  
  if (gridSize < 16 || gridSize > 80) {
    return NextResponse.json(
      { error: 'gridSize must be between 16 and 80' },
      { status: 400 }
    );
  }

  const startTime = Date.now();
  console.log(`🏙️ Generating ${gridSize}x${gridSize} density grid for ${city.toUpperCase()}`);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const bounds = CITY_BOUNDS[city];
    
    // Query ALL buildings in city bounds - no limits, no chunking
    console.log(`📍 Loading ALL buildings for ${city}...`);
    const { data: buildings, error } = await supabase
      .from('building_density')
      .select(`
        latitude,
        longitude,
        total_apartments,
        current_use,
        beginning_year,
        municipality
      `)
      .gte('latitude', bounds.south)
      .lte('latitude', bounds.north)
      .gte('longitude', bounds.west)
      .lte('longitude', bounds.east)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('❌ Database query error:', error);
      return NextResponse.json(
        { error: `Database query failed: ${error.message}` },
        { status: 500 }
      );
    }

    const totalBuildings = buildings?.length || 0;
    console.log(`🏢 Loaded ${totalBuildings} buildings - now computing spatial grid...`);

    if (totalBuildings === 0) {
      return NextResponse.json({
        success: true,
        city,
        grid: [],
        metadata: {
          totalBuildings: 0,
          gridSize,
          gridCells: 0,
          processingTimeMs: Date.now() - startTime
        }
      });
    }

    // Create spatial grid
    const latStep = (bounds.north - bounds.south) / gridSize;
    const lngStep = (bounds.east - bounds.west) / gridSize;
    
    // Initialize grid with Map for O(1) access
    const gridMap = new Map<string, GridCell>();
    
    // Spatial binning - assign each building to a grid cell
    let processedBuildings = 0;
    buildings.forEach(building => {
      const lat = building.latitude;
      const lng = building.longitude;
      
      // Calculate grid indices
      const xIndex = Math.min(Math.floor((lng - bounds.west) / lngStep), gridSize - 1);
      const yIndex = Math.min(Math.floor((lat - bounds.south) / latStep), gridSize - 1);
      
      const cellKey = `${xIndex},${yIndex}`;
      
      // Get or create cell
      let cell = gridMap.get(cellKey);
      if (!cell) {
        cell = {
          x: xIndex,
          y: yIndex,
          centerLat: bounds.south + (yIndex + 0.5) * latStep,
          centerLng: bounds.west + (xIndex + 0.5) * lngStep,
          buildingCount: 0,
          totalApartments: 0,
          avgApartments: 0,
          avgConstructionYear: null,
          residentialCount: 0,
          densityScore: 0
        };
        gridMap.set(cellKey, cell);
      }
      
      // Aggregate building data into cell
      cell.buildingCount++;
      cell.totalApartments += building.total_apartments || 0;
      
      // Track residential buildings
      if (building.current_use && building.current_use.toLowerCase().includes('residential')) {
        cell.residentialCount++;
      }
      
      // Aggregate construction years (running average)
      if (building.beginning_year && building.beginning_year > 1800 && building.beginning_year <= new Date().getFullYear()) {
        if (cell.avgConstructionYear === null) {
          cell.avgConstructionYear = building.beginning_year;
        } else {
          // Running average: new_avg = old_avg + (new_value - old_avg) / count
          cell.avgConstructionYear = Math.round(
            cell.avgConstructionYear + (building.beginning_year - cell.avgConstructionYear) / cell.buildingCount
          );
        }
      }
      
      processedBuildings++;
      
      // Progress logging for large datasets
      if (processedBuildings % 10000 === 0) {
        console.log(`📊 Processed ${processedBuildings}/${totalBuildings} buildings...`);
      }
    });

    // Convert map to array and calculate final metrics
    const gridCells = Array.from(gridMap.values());
    
    console.log(`🧮 Computing final metrics for ${gridCells.length} grid cells...`);
    
    // Calculate derived metrics for each cell
    gridCells.forEach(cell => {
      // Average apartments per building
      cell.avgApartments = cell.buildingCount > 0 
        ? Math.round((cell.totalApartments / cell.buildingCount) * 10) / 10
        : 0;
        
      // Density score (for heatmap weighting) - total apartments in cell
      cell.densityScore = cell.totalApartments;
    });

    // Sort by density for debugging and better compression
    gridCells.sort((a, b) => b.densityScore - a.densityScore);

    const processingTime = Date.now() - startTime;
    const maxDensity = gridCells[0]?.densityScore || 0;
    
    console.log(`✅ City-wide density grid complete!`);
    console.log(`📈 Stats: ${totalBuildings} buildings → ${gridCells.length} cells in ${processingTime}ms`);
    console.log(`🔥 Hottest cell: ${maxDensity} apartments`);

    return NextResponse.json({
      success: true,
      city,
      grid: gridCells,
      metadata: {
        totalBuildings,
        gridSize,
        gridCells: gridCells.length,
        maxDensity,
        processingTimeMs: processingTime,
        bounds
      }
    });

  } catch (error) {
    console.error('💥 Density grid generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate density grid' },
      { status: 500 }
    );
  }
}