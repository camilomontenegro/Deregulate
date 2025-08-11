import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  return NextResponse.json({ message: 'Scrape API endpoint is working' });
}

// Inline Idealista API functions
async function getIdealistaToken() {
  const credentials = Buffer.from(`${process.env.IDEALISTA_API_KEY}:${process.env.IDEALISTA_SECRET}`).toString('base64');
  
  const response = await fetch('https://api.idealista.com/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=read'
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Generate smart random page sequence that avoids empty pages
function generateSmartRandomPageSequence(maxRequests: number, totalAvailablePages: number = 0): number[] {
  const pages = new Set<number>();
  
  // Be very conservative with page limits to ensure we get data
  let safeMaxPage: number;
  if (totalAvailablePages > 0) {
    // Use at most 75% of available pages, capped at 15 for safety
    safeMaxPage = Math.min(Math.ceil(totalAvailablePages * 0.75), 15);
  } else {
    // Ultra-conservative when unknown
    safeMaxPage = 3;
  }
  
  console.log(`Safe page limit set to ${safeMaxPage} (from ${totalAvailablePages} total pages)`);
  
  // Always include page 1 as it's most likely to have data
  pages.add(1);
  
  // For remaining requests, be much more conservative
  while (pages.size < maxRequests && pages.size < safeMaxPage) {
    let randomPage: number;
    
    if (totalAvailablePages === 0) {
      // Conservative approach when we don't know total pages - stick to first few pages
      randomPage = Math.floor(Math.random() * 3) + 1; // Pages 1-3 only
    } else if (pages.size < maxRequests / 2) {
      // First half of requests: heavily favor early pages (90% from pages 1-5)
      randomPage = Math.random() < 0.9 
        ? Math.floor(Math.random() * 5) + 1  // 90% from pages 1-5
        : Math.floor(Math.random() * Math.min(safeMaxPage, 10)) + 1; // 10% from pages 1-10
    } else {
      // Second half: slightly more adventurous but still conservative
      randomPage = Math.random() < 0.7 
        ? Math.floor(Math.random() * 8) + 1  // 70% from pages 1-8
        : Math.floor(Math.random() * safeMaxPage) + 1; // 30% from all available
    }
    
    pages.add(randomPage);
  }
  
  return Array.from(pages).sort((a, b) => a - b);
}


// Province-wide city coordinates for comprehensive coverage
const provinceCoords: { [key: string]: { main: string; towns: string[] } } = {
  'Madrid': {
    main: '40.416775,-3.703790',
    towns: [
      '40.416775,-3.703790', // Madrid capital
      '40.534277,-3.640498', // Alcobendas
      '40.338056,-3.763889', // Getafe
      '40.310556,-3.474167', // Valdemoro
      '40.551111,-3.666944', // San Sebastián de los Reyes
      '40.455000,-3.833333', // Majadahonda
      '40.382222,-3.812500', // Fuenlabrada
      '40.378889,-3.875000', // Móstoles
      '40.345833,-3.874722', // Alcorcón
      '40.453333,-3.721944'  // Las Rozas
    ]
  },
  'Barcelona': {
    main: '41.385064,2.173403',
    towns: [
      '41.385064,2.173403', // Barcelona capital
      '41.533333,2.100000', // Sabadell
      '41.583333,2.116667', // Terrassa
      '41.366667,2.250000', // L'Hospitalet de Llobregat
      '41.366667,2.083333', // Sant Cugat del Vallès
      '41.433333,2.183333', // Granollers
      '41.450000,2.100000', // Cerdanyola del Vallès
      '41.500000,2.200000', // Mollet del Vallès
      '41.416667,2.216667', // Santa Coloma de Gramenet
      '41.400000,2.216667'  // Badalona
    ]
  },
  'Sevilla': {
    main: '37.389092,-5.984459',
    towns: [
      '37.389092,-5.984459', // Sevilla capital
      '37.350000,-5.916667', // Alcalá de Guadaíra
      '37.416667,-6.000000', // La Rinconada
      '37.400000,-5.833333', // Carmona
      '37.266667,-5.916667', // Utrera
      '37.433333,-5.850000', // Écija
      '37.183333,-5.783333', // Marchena
      '37.200000,-6.050000', // Lebrija
      '37.483333,-5.800000', // Lora del Río
      '37.300000,-5.783333'  // Morón de la Frontera
    ]
  },
  'Valencia': {
    main: '39.469907,-0.376288',
    towns: [
      '39.469907,-0.376288', // Valencia capital
      '39.500000,-0.400000', // Sagunto
      '39.416667,-0.333333', // Torrent
      '39.433333,-0.400000', // Paterna
      '39.400000,-0.316667', // Catarroja
      '39.383333,-0.333333', // Alzira
      '39.450000,-0.233333', // Xàtiva
      '39.350000,-0.433333', // Cullera
      '39.483333,-0.500000', // Canet de Berenguer
      '39.516667,-0.283333'  // Gandia area
    ]
  },
  'Bilbao': {
    main: '43.263013,-2.935021',
    towns: [
      '43.263013,-2.935021', // Bilbao capital
      '43.300000,-2.983333', // Getxo
      '43.333333,-2.966667', // Leioa
      '43.250000,-2.883333', // Barakaldo
      '43.233333,-2.916667', // Sestao
      '43.316667,-2.950000', // Berango
      '43.283333,-2.800000', // Durango
      '43.166667,-2.833333', // Galdakao
      '43.200000,-2.950000', // Basauri
      '43.350000,-3.000000'  // Sopelana
    ]
  },
  'Málaga': {
    main: '36.721261,-4.421482',
    towns: [
      '36.721261,-4.421482', // Málaga capital
      '36.683333,-4.566667', // Marbella
      '36.650000,-4.633333', // Estepona
      '36.750000,-4.350000', // Vélez-Málaga
      '36.733333,-4.300000', // Torre del Mar
      '36.766667,-4.250000', // Nerja
      '36.816667,-4.816667', // Ronda
      '36.700000,-4.500000', // Fuengirola
      '36.683333,-4.483333', // Benalmádena
      '36.666667,-4.566667'  // Torremolinos
    ]
  }
};

async function searchPropertiesInCity(city: string, propertyType: string, operation: string, page: number, distance: number, order: string, sort: string, randomMode: boolean = false, provinceWide: boolean = false) {
  const token = await getIdealistaToken();
  
  let center: string;
  
  if (provinceWide && provinceCoords[city]) {
    // Select random town from the province for variety
    const availableLocations = [provinceCoords[city].main, ...provinceCoords[city].towns];
    center = availableLocations[Math.floor(Math.random() * availableLocations.length)];
  } else if (provinceCoords[city]) {
    center = provinceCoords[city].main;
  } else {
    throw new Error(`Coordinates not found for city: ${city}`);
  }

  // Apply randomization if enabled
  let finalOrder = order;
  let finalSort = sort;
  let finalDistance = distance;
  
  if (randomMode) {
    // Randomize sort order for variety
    const orderOptions = ['price', 'publicationDate', 'distance', 'size'];
    finalOrder = orderOptions[Math.floor(Math.random() * orderOptions.length)];
    finalSort = Math.random() > 0.5 ? 'asc' : 'desc';
    
    // Add slight distance variation (±20%) for geographic diversity
    const distanceVariation = 0.8 + (Math.random() * 0.4);
    finalDistance = Math.floor(distance * distanceVariation);
  }

  // Correct Idealista API endpoint structure - POST with form data
  const params = new URLSearchParams({
    operation,
    propertyType,
    center,
    distance: finalDistance.toString(),
    country: 'es',
    maxItems: '50',
    numPage: page.toString(),
    order: finalOrder,
    sort: finalSort,
    // Add active status filter to ensure we only get active listings
    state: 'active'
  });

  const url = `https://api.idealista.com/3.5/es/search`;
  console.log('Idealista API URL:', url);
  console.log('Idealista API params:', params.toString());
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString()
  });

  console.log('Idealista API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Idealista API error:', errorText);
    throw new Error(`Search request failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Idealista API result:', result);
  return result;
}

export async function POST(request: NextRequest) {
  console.log('POST /api/admin/scrape called');
  try {
    const body = await request.json();
    console.log('Request body:', body);
    const { 
      city, 
      propertyType = 'homes', 
      operation = 'sale', 
      maxRequests = 5,
      distance = 2000,
      order = 'price',
      sort = 'asc',
      randomMode = false,
      provinceWide = false
    } = body;

    if (!city) {
      return NextResponse.json({ error: 'City is required' }, { status: 400 });
    }

    if (maxRequests > 20) {
      return NextResponse.json({ error: 'Maximum 20 requests allowed per scraping session' }, { status: 400 });
    }

    const validCities = ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga'];
    if (!validCities.includes(city)) {
      return NextResponse.json({ 
        error: `Invalid city. Allowed cities: ${validCities.join(', ')}` 
      }, { status: 400 });
    }

    const validPropertyTypes = ['homes', 'offices', 'premises', 'garages', 'bedrooms'];
    if (!validPropertyTypes.includes(propertyType)) {
      return NextResponse.json({ 
        error: `Invalid property type. Allowed types: ${validPropertyTypes.join(', ')}` 
      }, { status: 400 });
    }

    const validOperations = ['sale', 'rent'];
    if (!validOperations.includes(operation)) {
      return NextResponse.json({ 
        error: `Invalid operation. Allowed operations: ${validOperations.join(', ')}` 
      }, { status: 400 });
    }

    // Validate distance (500m to 10km)
    if (distance < 500 || distance > 10000) {
      return NextResponse.json({ 
        error: 'Distance must be between 500 and 10000 meters' 
      }, { status: 400 });
    }

    // Validate order parameter
    const validOrders = ['price', 'publicationDate', 'distance', 'size', 'modificationDate', 'ratioeurm2'];
    if (!validOrders.includes(order)) {
      return NextResponse.json({ 
        error: `Invalid order. Allowed orders: ${validOrders.join(', ')}` 
      }, { status: 400 });
    }

    // Validate sort parameter
    const validSorts = ['asc', 'desc'];
    if (!validSorts.includes(sort)) {
      return NextResponse.json({ 
        error: `Invalid sort. Allowed sorts: ${validSorts.join(', ')}` 
      }, { status: 400 });
    }

    const scrapingResults = {
      city,
      propertyType,
      operation,
      startTime: new Date().toISOString(),
      endTime: '', // Will be set after scraping
      duration: 0, // Will be set after scraping
      requestsUsed: 0,
      propertiesFound: 0,
      propertiesStored: 0,
      propertiesSkipped: 0,
      pages: [] as any[],
      errors: [] as any[]
    };

    let allProperties: any[] = [];

    // Initialize Supabase client with service role for database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate page sequence and get probe results if available
    console.log(`Generating page sequence for ${city} (Random: ${randomMode}, Province-wide: ${provinceWide})`);
    
    let probeResults: any = null;
    let pagesToScrape: number[];
    
    if (randomMode) {
      try {
        // Do the probe and get results
        console.log('Probing first page to understand data availability...');
        probeResults = await searchPropertiesInCity(
          city, propertyType, operation, 1, distance, order, sort, false, provinceWide
        );
        
        const totalPages = probeResults.totalPages || 0;
        const hasData = probeResults.elementList && probeResults.elementList.length > 0;
        
        console.log(`First page probe: ${probeResults.elementList?.length || 0} properties, ${totalPages} total pages`);
        
        if (!hasData) {
          console.log('No data found on first page, using sequential fallback');
          pagesToScrape = [1];
        } else {
          pagesToScrape = generateSmartRandomPageSequence(maxRequests, totalPages);
          console.log(`Generated smart random sequence based on ${totalPages} available pages`);
        }
        
        scrapingResults.requestsUsed = 1; // Count the probe request
      } catch (error) {
        console.error('Error during probe, falling back to conservative sequential:', error);
        pagesToScrape = Array.from({length: Math.min(maxRequests, 3)}, (_, i) => i + 1);
        probeResults = null;
      }
    } else {
      pagesToScrape = Array.from({length: maxRequests}, (_, i) => i + 1);
    }
    
    console.log(`${randomMode ? 'Adaptive random' : 'Sequential'} mode: Scraping pages ${pagesToScrape.join(', ')}`);

    for (let i = 0; i < pagesToScrape.length; i++) {
      const pageNumber = pagesToScrape[i];
      let searchResults: any;
      
      try {
        // Use cached probe results for page 1 in random mode
        if (randomMode && pageNumber === 1 && probeResults) {
          console.log(`Using cached probe results for page 1`);
          searchResults = probeResults;
        } else {
          console.log(`Scraping page ${pageNumber} for ${city} (${i + 1}/${pagesToScrape.length})...`);
          
          searchResults = await searchPropertiesInCity(
            city, 
            propertyType, 
            operation, 
            pageNumber, 
            distance, 
            order, 
            sort, 
            randomMode, 
            provinceWide
          );
          
          scrapingResults.requestsUsed++;
        }
        scrapingResults.propertiesFound += (searchResults.elementList?.length || 0);

        scrapingResults.pages.push({
          page: pageNumber,
          propertiesCount: searchResults.elementList?.length || 0,
          totalAvailable: searchResults.total || 0
        });

        if (!searchResults.elementList || searchResults.elementList.length === 0) {
          console.log(`No properties found on page ${pageNumber}, continuing with next page...`);
          continue;
        }

        // Filter for active properties only (double-check since API might not enforce it)
        const activeProperties = searchResults.elementList.filter((property: any) => 
          !property.status || property.status === 'active' || property.status === 'good'
        );

        console.log(`Found ${activeProperties.length} active properties out of ${searchResults.elementList.length} total on page ${pageNumber}`);
        allProperties = allProperties.concat(activeProperties);

        // Add delay between requests to be respectful to the API
        if (i < pagesToScrape.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error: any) {
        console.error(`Error on page ${pageNumber}:`, error.message);
        scrapingResults.errors.push({
          page: pageNumber,
          error: error.message
        });
        // Continue with other pages instead of breaking completely
        continue;
      }
    }

    // Store properties in Supabase
    if (allProperties.length > 0) {
      let inserted = 0;
      let skipped = 0;
      
      for (const property of allProperties) {
        try {
          const propertyData = {
            property_code: property.propertyCode,
            address: property.address || '',
            price: property.price || 0,
            operation: operation,
            property_type: propertyType.slice(0, -1), // Remove 's' from homes -> home
            size: property.size || null,
            rooms: property.rooms || null,
            bathrooms: property.bathrooms || null,
            floor: property.floor || null,
            exterior: property.exterior || false,
            latitude: property.latitude || null,
            longitude: property.longitude || null,
            municipality: property.municipality || city,
            district: property.district || '',
            neighborhood: property.neighborhood || '',
            province: property.province || '',
            status: 'active',
            new_development: property.newDevelopment || false,
            url: property.url || '',
            scraped_at: new Date().toISOString()
          };

          const { error } = await supabase
            .from('houses')
            .insert([propertyData]);

          if (error) {
            if (error.code === '23505') { // Unique constraint violation
              skipped++;
            } else {
              throw error;
            }
          } else {
            inserted++;
          }
        } catch (error: any) {
          console.error('Error inserting property:', error);
          scrapingResults.errors.push({
            operation: 'database_insert',
            error: error.message
          });
        }
      }
      
      scrapingResults.propertiesStored = inserted;
      scrapingResults.propertiesSkipped = skipped;
    }

    scrapingResults.endTime = new Date().toISOString();
    scrapingResults.duration = new Date(scrapingResults.endTime).getTime() - new Date(scrapingResults.startTime).getTime();

    // Log success metrics
    const successMessage = randomMode 
      ? `Random scraping completed for ${city}${provinceWide ? ' (province-wide)' : ''}: ${scrapingResults.propertiesStored} active properties stored from ${scrapingResults.requestsUsed} diverse page samples`
      : `Sequential scraping completed for ${city}: ${scrapingResults.propertiesStored} properties stored from ${scrapingResults.requestsUsed} pages`;
    
    console.log(successMessage);
    console.log('Scraping results:', scrapingResults);

    return NextResponse.json({
      success: true,
      results: scrapingResults
    });

  } catch (error: any) {
    console.error('Scraping error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}