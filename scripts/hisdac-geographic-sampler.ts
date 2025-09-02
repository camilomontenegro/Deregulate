const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const turf = require("@turf/turf");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

// HISDAC-ES Inspired Grid-Based Geographic Sampler
// Based on proven approach from 12M Spanish building dataset
// Uses 100m x 100m grid cells for true geographic distribution

// --- Supabase ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase environment variables are not set.');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are defined in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY as string);

// Configuration based on HISDAC-ES proven approach
const MAX_BUILDINGS = Number(process.env.MAX_BUILDINGS ?? 10);
const GRID_SIZE_METERS = 100; // 100m x 100m grid cells (HISDAC-ES standard)

// Sevilla bounds in decimal degrees
const SEVILLA_BOUNDS = {
  north: 37.45,
  south: 37.32,
  east: -5.85,
  west: -6.05
};

// Convert degrees to approximate meters (rough calculation for grid sizing)
// At Sevilla's latitude (~37°), 1 degree ≈ 111km, 1 degree lng ≈ 89km
const LAT_DEGREES_PER_100M = 100 / 111000; // ~0.0009 degrees per 100m
const LNG_DEGREES_PER_100M = 100 / 89000;  // ~0.0011 degrees per 100m

// Calculate grid dimensions
const GRID_WIDTH = Math.ceil((SEVILLA_BOUNDS.east - SEVILLA_BOUNDS.west) / LNG_DEGREES_PER_100M);
const GRID_HEIGHT = Math.ceil((SEVILLA_BOUNDS.north - SEVILLA_BOUNDS.south) / LAT_DEGREES_PER_100M);
const TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;
const BUILDINGS_PER_CELL = Math.ceil(MAX_BUILDINGS / TOTAL_CELLS);

console.log(`🏗️ HISDAC-ES Geographic Grid Sampler`);
console.log(`📐 Grid: ${GRID_WIDTH} x ${GRID_HEIGHT} = ${TOTAL_CELLS} cells`);
console.log(`🎯 Target: ${MAX_BUILDINGS} buildings (~${BUILDINGS_PER_CELL} per cell)`);
console.log(`📍 Cell size: ~100m x 100m (HISDAC-ES standard)\n`);

function ensureLonLat([a, b]: [number, number]): [number, number] {
  const looksLatLon = (Math.abs(a) <= 90 && Math.abs(b) <= 180);
  const inSevillaIfSwapped = (b > -6.2 && b < -5.6) && (a > 37.2 && a < 37.6);
  if (looksLatLon && inSevillaIfSwapped) return [b, a];
  return [a, b];
}

// Grid cell key generator - creates unique key for each 100m cell
function getGridCellKey(lon: number, lat: number): string {
  const cellX = Math.floor((lon - SEVILLA_BOUNDS.west) / LNG_DEGREES_PER_100M);
  const cellY = Math.floor((lat - SEVILLA_BOUNDS.south) / LAT_DEGREES_PER_100M);
  return `${cellX},${cellY}`;
}

// HISDAC-ES inspired batch upsert
async function batchUpsert(buildings: any[]) {
  if (buildings.length === 0) return;

  const batchData = buildings.map(building => ({
    cadastral_ref_building: building.rc14,
    total_apartments: building.apartments,
    building_address: building.address ?? "",
    latitude: building.lat,
    longitude: building.lon,
    municipality: "Sevilla",
    province: "Sevilla", 
    last_updated: new Date().toISOString(),
    current_use: building.currentUse || null,
    condition_of_construction: building.conditionOfConstruction || null,
    beginning_year: building.beginningYear || null,
    number_of_dwellings: building.numberOfDwellings || null,
    building_area_m2: building.buildingAreaM2 || null,
  }));

  const { error } = await supabase
    .from("building_density")
    .upsert(batchData, { onConflict: "cadastral_ref_building" });
    
  if (error) {
    console.error('❌ Batch upsert failed:', error);
    throw error;
  }
  
  console.log(`✅ Inserted ${buildings.length} buildings from ${new Set(buildings.map(b => getGridCellKey(b.lon, b.lat))).size} grid cells`);
}

async function run() {
  const file = path.resolve("data/sevilla_buildings.geojson");
  
  if (!fs.existsSync(file)) {
    console.error('❌ GeoJSON file not found:', file);
    process.exit(1);
  }
  
  const source = fs.createReadStream(file, { encoding: "utf8" });
  const jsonParser = parser();
  const pickFeatures = pick({ filter: 'features' });
  const features = streamArray();

  // Grid-based sampling: Map of cellKey -> buildings array
  const gridCells = new Map<string, any[]>();
  let totalProcessed = 0;
  let totalSelected = 0;
  const seen = new Set<string>();

  features.on("data", async ({ value }: { value: any }) => {
    const f = value as {
      type: "Feature";
      properties: any;
      geometry: { type: string; coordinates: any };
    };

    // 1) Extract RC14 (unique building ID)
    const rc14: string | undefined = f.properties?.localId || f.properties?.reference || f.properties?.gml_id;
    if (!rc14 || seen.has(rc14)) return;
    seen.add(rc14);

    // 2) Extract apartments/dwellings
    const apartments = Number(f.properties?.numberOfDwellings ?? f.properties?.numberOfBuildingUnits ?? 0);
    if (!Number.isFinite(apartments) || apartments <= 0) return;

    // 3) Calculate centroid coordinates
    let geom = f.geometry;
    if (!geom) return;

    // Fix coordinate order if needed
    if (geom.type === "Polygon") {
      geom = {
        type: "Polygon",
        coordinates: geom.coordinates.map((ring: any[]) => 
          ring.map(([x, y]: [number, number]) => ensureLonLat([x, y]))
        ),
      };
    } else if (geom.type === "MultiPolygon") {
      geom = {
        type: "MultiPolygon",
        coordinates: geom.coordinates.map((poly: any[]) =>
          poly.map((ring: any[]) => 
            ring.map(([x, y]: [number, number]) => ensureLonLat([x, y]))
          )
        ),
      };
    } else if (geom.type === "Point") {
      geom = { type: "Point", coordinates: ensureLonLat(geom.coordinates) };
    }

    const centroid = turf.centroid({ type: "Feature", properties: {}, geometry: geom as any });
    const [lon, lat] = centroid.geometry.coordinates as [number, number];

    // 4) Check if coordinates are within Sevilla bounds
    if (lat < SEVILLA_BOUNDS.south || lat > SEVILLA_BOUNDS.north ||
        lon < SEVILLA_BOUNDS.west || lon > SEVILLA_BOUNDS.east) {
      return; // Skip buildings outside Sevilla
    }

    totalProcessed++;

    // 5) Assign to grid cell using HISDAC-ES approach
    const cellKey = getGridCellKey(lon, lat);
    
    if (!gridCells.has(cellKey)) {
      gridCells.set(cellKey, []);
    }
    
    const cell = gridCells.get(cellKey)!;
    
    // Extract additional filter fields (HISDAC-ES 6 core attributes)
    const currentUse = f.properties?.currentUse ? String(f.properties.currentUse) : undefined;
    const conditionOfConstruction = f.properties?.conditionOfConstruction ? String(f.properties.conditionOfConstruction) : undefined;
    
    let beginningYear: number | undefined = undefined;
    if (f.properties?.beginning) {
      const yearMatch = String(f.properties.beginning).match(/^\d{4}/);
      if (yearMatch) beginningYear = Number(yearMatch[0]);
    }
    
    const numberOfDwellings = f.properties?.numberOfDwellings ? Number(f.properties.numberOfDwellings) : undefined;
    const buildingAreaM2 = f.properties?.value ? Number(f.properties.value) : undefined;

    const buildingData = {
      rc14,
      apartments,
      lon,
      lat,
      address: f.properties?.informationSystem || "",
      currentUse,
      conditionOfConstruction,
      beginningYear,
      numberOfDwellings,
      buildingAreaM2,
    };

    // Reservoir sampling within grid cell (HISDAC-ES inspired)
    if (cell.length < BUILDINGS_PER_CELL) {
      cell.push(buildingData);
      totalSelected++;
    } else {
      // Replace random building in this cell
      const randomIndex = Math.floor(Math.random() * cell.length);
      cell[randomIndex] = buildingData;
    }

    // Progress logging
    if (totalProcessed % 5000 === 0) {
      console.log(`📊 Processed: ${totalProcessed} | Selected: ${totalSelected} | Cells: ${gridCells.size}`);
    }
  });

  features.on("end", async () => {
    console.log(`\n🏁 Processing complete!`);
    console.log(`📈 Total processed: ${totalProcessed} buildings`);
    console.log(`🎯 Selected for database: ${totalSelected} buildings`);
    console.log(`🗺️ Grid cells with buildings: ${gridCells.size}/${TOTAL_CELLS}`);

    // Collect all selected buildings from all grid cells
    const allSelectedBuildings: any[] = [];
    gridCells.forEach((buildings, cellKey) => {
      allSelectedBuildings.push(...buildings);
    });

    // Shuffle to avoid bias and limit to exact target
    const shuffled = allSelectedBuildings.sort(() => Math.random() - 0.5);
    const finalSelection = shuffled.slice(0, MAX_BUILDINGS);

    console.log(`\n💾 Inserting ${finalSelection.length} buildings into database...`);
    
    // Batch processing (HISDAC-ES approach for large datasets)
    const BATCH_SIZE = 100;
    for (let i = 0; i < finalSelection.length; i += BATCH_SIZE) {
      const batch = finalSelection.slice(i, i + BATCH_SIZE);
      await batchUpsert(batch);
    }

    console.log(`\n✅ Geographic sampling complete!`);
    console.log(`📍 Buildings distributed across ${new Set(finalSelection.map(b => getGridCellKey(b.lon, b.lat))).size} grid cells`);
    
    // Print grid cell distribution summary
    const cellDistribution = new Map<string, number>();
    finalSelection.forEach(b => {
      const key = getGridCellKey(b.lon, b.lat);
      cellDistribution.set(key, (cellDistribution.get(key) || 0) + 1);
    });
    
    console.log(`📊 Buildings per cell: min=${Math.min(...cellDistribution.values())}, max=${Math.max(...cellDistribution.values())}, avg=${Math.round(finalSelection.length / cellDistribution.size)}`);
  });

  // Error handlers
  [source, jsonParser, pickFeatures, features].forEach(stream => {
    stream.on('error', (err: any) => {
      console.error('❌ Stream error:', err);
      process.exit(1);
    });
  });

  // Start the pipeline
  source
    .pipe(jsonParser)
    .pipe(pickFeatures)
    .pipe(features);
}

run().catch(console.error);