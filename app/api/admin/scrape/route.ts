import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import supabaseClient from '../../../lib/supabase/client';

export async function GET() {
  return NextResponse.json({ message: 'Scrape API endpoint is working' });
}

// Inline Idealista API functions
async function getIdealistaToken(retryCount = 0) {
  const maxRetries = 3;
  
  // Validate environment variables
  if (!process.env.IDEALISTA_API_KEY || !process.env.IDEALISTA_SECRET) {
    throw new Error('Missing IDEALISTA_API_KEY or IDEALISTA_SECRET environment variables');
  }

  try {
    const credentials = Buffer.from(`${process.env.IDEALISTA_API_KEY}:${process.env.IDEALISTA_SECRET}`).toString('base64');
    
    const response = await fetch('https://api.idealista.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=read',
      // Add timeout and connection options
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('No access token received from Idealista API');
    }
    
    console.log('✅ Successfully obtained Idealista token');
    return data.access_token;
    
  } catch (error: any) {
    console.error(`❌ Token request attempt ${retryCount + 1} failed:`, error.message);
    
    if (retryCount < maxRetries) {
      console.log(`⏳ Retrying token request in ${(retryCount + 1) * 1000}ms...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
      return getIdealistaToken(retryCount + 1);
    }
    
    throw new Error(`Failed to get Idealista token after ${maxRetries + 1} attempts: ${error.message}`);
  }
}

// Generate conservative random page sequence 
function generateSmartRandomPageSequence(maxRequests: number, totalAvailablePages: number = 0): number[] {
  const pages = new Set<number>();
  
  // Be very conservative with page range to prevent API waste
  let maxPage = Math.min(totalAvailablePages > 0 ? totalAvailablePages : 10, 15);
  
  console.log(`Generating ${maxRequests} random pages from 1-${maxPage} (${totalAvailablePages} total available)`);
  
  // Always start with page 1
  pages.add(1);
  
  // Add a few more pages conservatively, favoring early pages
  for (let i = 1; i < maxRequests && pages.size < maxRequests; i++) {
    let randomPage: number;
    
    // 70% chance for pages 1-5, 30% chance for pages 6-maxPage
    if (Math.random() < 0.7) {
      randomPage = Math.floor(Math.random() * Math.min(5, maxPage)) + 1;
    } else {
      randomPage = Math.floor(Math.random() * maxPage) + 1;
    }
    
    pages.add(randomPage);
  }
  
  const finalPages = Array.from(pages).sort((a, b) => a - b);
  console.log(`Generated ${finalPages.length} conservative pages: [${finalPages.join(', ')}]`);
  
  return finalPages;
}


// Province-wide location IDs for comprehensive coverage
const provinceLocationIds: { [key: string]: string } = {
  'Madrid': '0-EU-ES-28',      // Madrid Province
  'Barcelona': '0-EU-ES-08',   // Barcelona Province  
  'Sevilla': '0-EU-ES-41',     // Sevilla Province
  'Valencia': '0-EU-ES-46',    // Valencia Province
  'Bilbao': '0-EU-ES-48',      // Vizcaya Province (Bilbao)
  'Málaga': '0-EU-ES-29'       // Málaga Province
};

async function searchPropertiesInCity(city: string, propertyType: string, operation: string, page: number, order: string, sort: string) {
  const token = await getIdealistaToken();
  
  // Get province location ID for comprehensive coverage
  let locationId: string;
  if (provinceLocationIds[city]) {
    locationId = provinceLocationIds[city];
  } else {
    throw new Error(`Location ID not found for city: ${city}`);
  }

  let finalOrder = order;
  let finalSort = sort;

  // Correct Idealista API endpoint structure - POST with form data using locationId
  const params = new URLSearchParams({
    operation,
    propertyType,
    locationId,
    country: 'es',
    maxItems: '50',
    numPage: page.toString(),
    order: finalOrder,
    sort: finalSort
  });

  const url = `https://api.idealista.com/3.5/es/search`;
  console.log(`🔍 Searching ${city} province (${locationId}) page ${page}:`, params.toString());
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      // Add timeout and connection options
      signal: AbortSignal.timeout(45000) // 45 second timeout for search
    });

    console.log(`📡 API Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Idealista API error (${response.status}):`, errorText);
      
      // Handle specific error cases
      if (response.status === 401) {
        throw new Error(`Authentication failed - token may be expired: ${errorText}`);
      } else if (response.status === 429) {
        throw new Error(`Rate limit exceeded - too many requests: ${errorText}`);
      } else if (response.status >= 500) {
        throw new Error(`Idealista server error (${response.status}): ${errorText}`);
      }
      
      throw new Error(`Search request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Validate response structure
    if (!result) {
      throw new Error('Empty response from Idealista API');
    }
    
    console.log(`✅ Found ${result.elementList?.length || 0} properties on page ${page}`);
    
    // Debug: Log municipalities found in this page
    if (result.elementList && result.elementList.length > 0) {
      const municipalities = [...new Set(result.elementList.map((p: any) => p.municipality).filter(Boolean))];
      console.log(`📍 Municipalities found on page ${page}:`, municipalities.join(', '));
    }
    
    return result;
    
  } catch (error: any) {
    // Distinguish between network errors and API errors
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error(`Request timeout for ${city} page ${page} - try again later`);
    }
    
    if (error.message.includes('fetch failed')) {
      throw new Error(`Network connection failed for ${city} page ${page} - check internet connection`);
    }
    
    // Re-throw other errors as-is
    throw error;
  }
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

    // Validate location ID exists for the city
    if (!provinceLocationIds[city]) {
      return NextResponse.json({ 
        error: `Location ID not available for ${city}. Available cities: ${Object.keys(provinceLocationIds).join(', ')}` 
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

    // Generate page sequence - use sequential approach for province-wide search
    console.log(`Generating page sequence for ${city} province (Location ID: ${provinceLocationIds[city]})`);
    
    let probeResults: any = null;
    let pagesToScrape: number[];
    
    try {
      // Probe first page to get total available pages
      console.log('Probing first page to check data availability...');
      probeResults = await searchPropertiesInCity(
        city, propertyType, operation, 1, order, sort
      );
      
      const hasData = probeResults.elementList && probeResults.elementList.length > 0;
      const reportedPages = probeResults.totalPages || 0;
      
      console.log(`First page probe: ${probeResults.elementList?.length || 0} properties found`);
      console.log(`Province has ${reportedPages} total pages available`);
      
      if (!hasData) {
        console.log('⚠️ No data found on page 1');
        pagesToScrape = [1]; // Just try page 1
      } else {
        // Use sequential pages for maximum coverage
        pagesToScrape = Array.from({length: maxRequests}, (_, i) => i + 1);
        console.log(`Generated sequential pages: [${pagesToScrape.join(', ')}] of ${reportedPages} available`);
      }
      
      scrapingResults.requestsUsed = 1; // Count the probe request
    } catch (error) {
      console.error('Probe request failed, using safe sequential mode:', error);
      pagesToScrape = Array.from({length: Math.min(maxRequests, 5)}, (_, i) => i + 1);
      probeResults = null;
    }
    
    console.log(`Province-wide search: Scraping pages ${pagesToScrape.join(', ')}`);

    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmpty = 3; // Allow more empty pages for province-wide search

    for (let i = 0; i < pagesToScrape.length; i++) {
      const pageNumber = pagesToScrape[i];
      let searchResults: any;
      
      try {
        // Use cached probe results for page 1
        if (pageNumber === 1 && probeResults) {
          console.log(`Using cached probe results for page 1`);
          searchResults = probeResults;
        } else {
          console.log(`Scraping page ${pageNumber} for ${city} province (${i + 1}/${pagesToScrape.length})...`);
          
          searchResults = await searchPropertiesInCity(
            city, 
            propertyType, 
            operation, 
            pageNumber, 
            order, 
            sort
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
          consecutiveEmptyPages++;
          console.log(`No properties found on page ${pageNumber} (${consecutiveEmptyPages}/${maxConsecutiveEmpty} consecutive empty pages)`);
          
          // Early termination to prevent API waste
          if (consecutiveEmptyPages >= maxConsecutiveEmpty) {
            console.log(`⚠️ Stopping scraping after ${consecutiveEmptyPages} consecutive empty pages to prevent API waste`);
            break;
          }
          continue;
        } else {
          consecutiveEmptyPages = 0; // Reset counter when we find results
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

    // Filter out existing properties before database insertion
    console.log(`🔍 Filtering ${allProperties.length} properties to remove duplicates...`);
    
    let newProperties = allProperties;
    if (allProperties.length > 0) {
      try {
        // Get existing property codes from database
        const existingCodes = await supabaseClient.getExistingPropertyCodes();
        console.log(`📋 Found ${existingCodes.size} existing properties in database`);
        
        // Filter out properties that already exist
        newProperties = supabaseClient.filterNewProperties(allProperties, existingCodes);
        
        console.log(`✨ After filtering: ${newProperties.length} new properties (${allProperties.length - newProperties.length} duplicates removed)`);
        
        // Update results with filtering info
        scrapingResults.propertiesSkipped = allProperties.length - newProperties.length;
        
      } catch (error) {
        console.error('Error filtering properties, proceeding without filtering:', error);
        // Continue with all properties if filtering fails
        newProperties = allProperties;
      }
    }

    // Store properties in Supabase
    console.log(`💾 Starting database insertion for ${newProperties.length} new properties...`);
    
    if (newProperties.length > 0) {
      let inserted = 0;
      let skipped = 0;
      let dbErrors = 0;
      
      // Validate Supabase client
      if (!supabase) {
        throw new Error('Supabase client not initialized - check environment variables');
      }
      
      for (const property of newProperties) {
        try {
          // Validate required property data
          if (!property.propertyCode) {
            console.warn(`⚠️ Skipping property without propertyCode:`, property);
            skipped++;
            continue;
          }
          
          if (!property.price || property.price <= 0) {
            console.warn(`⚠️ Skipping property with invalid price:`, property.propertyCode, property.price);
            skipped++;
            continue;
          }

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

          console.log(`💾 Inserting property ${property.propertyCode} - €${property.price?.toLocaleString()} in ${property.municipality || city}`);

          const { data, error } = await supabase
            .from('houses')
            .insert([propertyData])
            .select();

          if (error) {
            if (error.code === '23505') { // Unique constraint violation - should be rare now with pre-filtering
              console.log(`⏭️ Property ${property.propertyCode} already exists (edge case), skipping`);
              skipped++;
            } else {
              console.error(`❌ Database error for property ${property.propertyCode}:`, error);
              dbErrors++;
              scrapingResults.errors.push({
                operation: 'database_insert',
                property_code: property.propertyCode,
                error: error.message
              });
            }
          } else {
            console.log(`✅ Successfully inserted property ${property.propertyCode}`);
            inserted++;
          }
        } catch (error: any) {
          console.error(`💥 Unexpected error inserting property ${property?.propertyCode}:`, error);
          dbErrors++;
          scrapingResults.errors.push({
            operation: 'database_insert',
            property_code: property?.propertyCode || 'unknown',
            error: error.message
          });
        }
      }
      
      console.log(`📊 Database insertion complete: ${inserted} inserted, ${skipped} skipped, ${dbErrors} errors`);
      
      scrapingResults.propertiesStored = inserted;
      scrapingResults.propertiesSkipped += skipped; // Add DB skips to pre-filter skips
    } else {
      console.log(`⚠️ No properties to store in database`);
    }

    scrapingResults.endTime = new Date().toISOString();
    scrapingResults.duration = new Date(scrapingResults.endTime).getTime() - new Date(scrapingResults.startTime).getTime();

    // Log success metrics
    const successMessage = `Province-wide scraping completed for ${city} (${provinceLocationIds[city]}): ${scrapingResults.propertiesStored} properties stored from ${scrapingResults.requestsUsed} pages`;
    
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