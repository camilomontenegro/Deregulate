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

async function searchPropertiesInCity(city: string, propertyType: string, operation: string, page: number, distance: number, order: string, sort: string) {
  const token = await getIdealistaToken();
  
  // Simple geocoding for major Spanish cities
  const cityCoords: { [key: string]: string } = {
    'Madrid': '40.416775,-3.703790',
    'Barcelona': '41.385064,2.173403',
    'Sevilla': '37.389092,-5.984459',
    'Valencia': '39.469907,-0.376288',
    'Bilbao': '43.263013,-2.935021',
    'Málaga': '36.721261,-4.421482'
  };

  const center = cityCoords[city];
  if (!center) {
    throw new Error(`Coordinates not found for city: ${city}`);
  }

  // Correct Idealista API endpoint structure - POST with form data
  const params = new URLSearchParams({
    operation,
    propertyType,
    center,
    distance: distance.toString(),
    country: 'es',
    maxItems: '50',
    numPage: page.toString(),
    order,
    sort
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
      sort = 'asc'
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
    let currentPage = 1;

    // Initialize Supabase client with service role for database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    while (currentPage <= maxRequests) {
      try {
        console.log(`Scraping page ${currentPage} for ${city}...`);
        
        const searchResults = await searchPropertiesInCity(city, propertyType, operation, currentPage, distance, order, sort);

        scrapingResults.requestsUsed++;
        scrapingResults.propertiesFound += (searchResults.elementList?.length || 0);

        scrapingResults.pages.push({
          page: currentPage,
          propertiesCount: searchResults.elementList?.length || 0,
          totalAvailable: searchResults.total || 0
        });

        if (!searchResults.elementList || searchResults.elementList.length === 0) {
          console.log(`No more properties found on page ${currentPage}, stopping...`);
          break;
        }

        allProperties = allProperties.concat(searchResults.elementList);

        if (currentPage >= (searchResults.totalPages || 1)) {
          console.log(`Reached last page (${searchResults.totalPages}), stopping...`);
          break;
        }

        currentPage++;

        if (currentPage <= maxRequests) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error: any) {
        console.error(`Error on page ${currentPage}:`, error.message);
        scrapingResults.errors.push({
          page: currentPage,
          error: error.message
        });
        break;
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

    console.log('Scraping completed:', scrapingResults);

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