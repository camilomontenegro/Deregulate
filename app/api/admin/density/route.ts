import { NextRequest, NextResponse } from 'next/server';
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { createClient } = require("@supabase/supabase-js");
const turf = require("@turf/turf");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

// Structured logging for production deployment
interface LogContext {
  operation: string;
  sessionId: string;
  timestamp: string;
  [key: string]: any;
}

const logger = {
  info: (message: string, context: Partial<LogContext> = {}) => {
    const logEntry = {
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    console.log(JSON.stringify(logEntry));
  },
  warn: (message: string, context: Partial<LogContext> = {}) => {
    const logEntry = {
      level: 'WARN', 
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    console.warn(JSON.stringify(logEntry));
  },
  error: (message: string, error?: Error, context: Partial<LogContext> = {}) => {
    const logEntry = {
      level: 'ERROR',
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      timestamp: new Date().toISOString(),
      ...context
    };
    console.error(JSON.stringify(logEntry));
  }
};

const pipe = promisify(pipeline);

// Some files came out as [lat, lon]. Detect & fix.
function ensureLonLat([a, b]: [number, number]): [number, number] {
  // if first value is in lat range and second looks like lon → swap
  const looksLatLon = (Math.abs(a) <= 90 && Math.abs(b) <= 180);
  const inSevillaIfSwapped = (b > -6.2 && b < -5.6) && (a > 37.2 && a < 37.6);
  if (looksLatLon && inSevillaIfSwapped) return [b, a]; // swap → [lon, lat]
  return [a, b]; // already [lon, lat]
}

export async function POST(request: NextRequest) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logContext = { operation: 'density_ingestion', sessionId };
  
  try {
    const body = await request.json();
    const { maxBuildings = 500 } = body;
    
    logger.info('Density ingestion started', { ...logContext, maxBuildings });

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load all existing building IDs into memory for O(1) duplicate checking
    logger.info('Loading existing building IDs for duplicate detection', logContext);
    const startLoadTime = Date.now();
    const { data: existingBuildings, error: loadError } = await supabase
      .from("building_density")
      .select("cadastral_ref_building");
    
    if (loadError) {
      logger.error('Failed to load existing building IDs', loadError, logContext);
      return NextResponse.json(
        { error: `Failed to load existing buildings: ${loadError.message}` },
        { status: 500 }
      );
    }
    
    // Create in-memory duplicate set for O(1) lookups
    interface BuildingRow {
      cadastral_ref_building: string;
    }

    const existingBuildingIds = new Set<string>(
      (existingBuildings as BuildingRow[] | null)?.map((row: BuildingRow) => row.cadastral_ref_building) || []
    );
    const loadDuration = Date.now() - startLoadTime;
    logger.info('Existing building IDs loaded successfully', { 
      ...logContext, 
      existingCount: existingBuildingIds.size, 
      loadDurationMs: loadDuration 
    });

    interface BuildingData {
      rc14: string;
      apartments: number;
      lon: number;
      lat: number;
      address?: string;
      currentUse?: string;
      conditionOfConstruction?: string;
      beginningYear?: number;
      numberOfDwellings?: number;
      buildingAreaM2?: number;
    }

    // Dynamic batch size - don't batch more buildings than requested
    const BATCH_SIZE = Math.min(maxBuildings, 50);
    let buildingBatch: BuildingData[] = [];

    async function processBatch(batch: BuildingData[], isLastBatch = false) {
      if (batch.length === 0) return 0;

      const batchData = batch.map(building => ({
        cadastral_ref_building: building.rc14,
        total_apartments: building.apartments,
        building_address: building.address ?? "",
        latitude: building.lat,
        longitude: building.lon,
        municipality: "Sevilla",
        province: "Sevilla",
        last_updated: new Date().toISOString(),
        raw_cadastral_data: null,
        current_use: building.currentUse || null,
        condition_of_construction: building.conditionOfConstruction || null,
        beginning_year: building.beginningYear || null,
        number_of_dwellings: building.numberOfDwellings || null,
        building_area_m2: building.buildingAreaM2 || null,
      }));

      logger.info('Processing batch upsert', { 
        ...logContext, 
        batchSize: batch.length,
        isLastBatch,
        buildingIds: batch.slice(0, 3).map(b => b.rc14)
      });

      // DEBUG: Log the exact data being sent
      logger.info('Attempting upsert with data', {
        ...logContext,
        batchSize: batchData.length,
        sampleRecord: batchData[0],
        upsertOptions: { onConflict: "cadastral_ref_building", ignoreDuplicates: false }
      });

      const { data, error } = await supabase
        .from("building_density")
        .upsert(batchData, { 
          onConflict: "cadastral_ref_building",
          ignoreDuplicates: false
        })
        .select(); // CRITICAL: Add .select() to return inserted data
      
      if (error) {
        logger.error('Batch upsert failed', error, { 
          ...logContext, 
          batchSize: batch.length,
          errorCode: error.code,
          errorDetails: error.details,
          buildingIds: batch.map(b => b.rc14)
        });
        throw new Error(`Batch upsert failed: ${error.message}`);
      }

      // CRITICAL: Check if data was actually returned (indicates successful insert/update)
      const recordsAffected = data ? data.length : 0;
      
      logger.info('Batch upsert completed', { 
        ...logContext, 
        batchSize: batch.length,
        recordsAffected,
        isLastBatch,
        sampleData: data ? data.slice(0, 2) : null
      });
      
      // DIAGNOSTIC: If no records affected, this indicates RLS/permission issue
      if (recordsAffected === 0) {
        logger.error('CRITICAL: Upsert succeeded but no records affected - likely RLS policy issue', null, {
          ...logContext,
          batchSize: batch.length,
          sampleBuilding: batchData[0],
          suggestion: 'Check Supabase RLS policies on building_density table'
        });
      }

      return batch.length;
    }

    // Check if GeoJSON file exists
    const filePath = path.resolve(process.cwd(), "data/sevilla_buildings.geojson");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'GeoJSON file not found at /data/sevilla_buildings.geojson' },
        { status: 404 }
      );
    }

    // Process the GeoJSON file
    return new Promise((resolve) => {
      const source = fs.createReadStream(filePath, { encoding: "utf8" });
      const jsonParser = parser();
      const pickFeatures = pick({ filter: 'features' });
      const features = streamArray();

      let processed = 0;
      let skippedDuplicates = 0;
      let errorCount = 0;
      const seen = new Set<string>();
      const startTime = Date.now();
      let limitReached = false;
      let streamEnded = false;
      let processingQueue: any[] = [];
      let isProcessing = false;
      const processedBuildings = new Set<string>(); // Track successfully processed buildings

      // Add error handling
      source.on('error', (err: any) => {
        // Ignore "Premature close" errors after limit reached - this is expected
        if (limitReached && err.message === 'Premature close') {
          logger.info('Expected stream close after limit reached', logContext);
          return;
        }
        logger.error('File read error', err, logContext);
        if (!limitReached) {
          resolve(NextResponse.json(
            { error: `File read failed: ${err.message}` },
            { status: 500 }
          ));
        }
      });
      
      jsonParser.on('error', (err: any) => {
        // Ignore "Premature close" errors after limit reached - this is expected
        if (limitReached && err.message === 'Premature close') {
          logger.info('Expected JSON parser close after limit reached', logContext);
          return;
        }
        logger.error('JSON parsing error', err, logContext);
        if (!limitReached) {
          resolve(NextResponse.json(
            { error: `JSON parsing failed: ${err.message}` },
            { status: 500 }
          ));
        }
      });
      
      pickFeatures.on('error', (err: any) => {
        // Ignore "Premature close" errors after limit reached - this is expected
        if (limitReached && err.message === 'Premature close') {
          logger.info('Expected pick filter close after limit reached', logContext);
          return;
        }
        logger.error('Pick filter error', err, logContext);
        if (!limitReached) {
          resolve(NextResponse.json(
            { error: `Pick filter failed: ${err.message}` },
            { status: 500 }
          ));
        }
      });
      
      features.on('error', (err: any) => {
        // Ignore "Premature close" errors after limit reached - this is expected
        if (limitReached && err.message === 'Premature close') {
          logger.info('Expected stream array close after limit reached', logContext);
          return;
        }
        logger.error('Stream array error', err, logContext);
        if (!limitReached) {
          resolve(NextResponse.json(
            { error: `Stream array failed: ${err.message}` },
            { status: 500 }
          ));
        }
      });

      // Helper function to terminate processing when limit is reached
      const initiateTermination = async () => {
        if (limitReached) return;
        limitReached = true;
        
        // Process any remaining buildings in the current batch before terminating
        if (buildingBatch.length > 0) {
          try {
            // Only process buildings that won't exceed the limit
            const remainingSlots = maxBuildings - processed;
            const finalBatch = buildingBatch.slice(0, remainingSlots);
            
            if (finalBatch.length > 0) {
              const batchProcessed = await processBatch(finalBatch, true);
              
              finalBatch.forEach(building => {
                existingBuildingIds.add(building.rc14);
                processedBuildings.add(building.rc14);
              });
              
              processed += batchProcessed;
            }
            
            buildingBatch = [];
            
          } catch (dbError) {
            const remainingSlots = maxBuildings - processed;
            const finalBatchSize = Math.min(buildingBatch.length, remainingSlots);
            errorCount += finalBatchSize;
            logger.error('Final batch processing failed during termination', dbError as Error, { 
              ...logContext, 
              batchSize: finalBatchSize,
              processed,
              errorCount 
            });
          }
        }
        
        const duration = Date.now() - startTime;
        logger.info('Processing limit reached', { 
          ...logContext, 
          processed, 
          maxBuildings, 
          skippedDuplicates, 
          errorCount,
          uniqueRCs: seen.size, 
          durationMs: duration 
        });
        
        // VERIFICATION: Check if our specific buildings were actually inserted
        try {
          // Get a few sample RC14s from the processed buildings
          const sampleIds = Array.from(processedBuildings).slice(0, 3);
          const { data: verificationData, error: verificationError } = await supabase
            .from('building_density')
            .select('cadastral_ref_building')
            .in('cadastral_ref_building', sampleIds);
          
          if (verificationError) {
            throw verificationError;
          }
          
          const foundRecords = verificationData?.length || 0;
          const sampleSize = Math.min(sampleIds.length, 3);
          
          logger.info('Database verification complete', {
            ...logContext,
            processedBuildings: processed,
            sampleIds,
            foundRecords,
            sampleSize,
            verificationSuccess: foundRecords === sampleSize
          });
          
          if (foundRecords !== sampleSize) {
            logger.error('CRITICAL: Sample verification failed - some records not found', null, {
              ...logContext,
              expectedSamples: sampleSize,
              foundSamples: foundRecords,
              missingSamples: sampleSize - foundRecords,
              sampleIds
            });
          } else {
            logger.info('SUCCESS: All sample records verified in database', {
              ...logContext,
              processedBuildings: processed,
              verifiedSamples: foundRecords
            });
          }
        } catch (verificationError) {
          logger.error('Database verification failed', verificationError as Error, logContext);
        }
        
        // Clear the processing queue to prevent further processing
        processingQueue = [];
        
        // Resolve immediately to send response, then clean up streams  
        resolve(NextResponse.json({
          success: true,
          results: {
            processed,
            skippedDuplicates,
            errorCount,
            uniqueRCs: seen.size,
            duration,
            limitReached: true,
            loadDuration,
            existingBuildingsCount: existingBuildingIds.size,
            message: `Successfully processed ${processed} new buildings (limit: ${maxBuildings}). Skipped ${skippedDuplicates} duplicates using O(1) in-memory lookups. Encountered ${errorCount} errors. Total unique references: ${seen.size}`
          }
        }));
        
        // Clean up streams after response is sent
        setImmediate(() => {
          try {
            source.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      };

      // Handle stream closure (when limit is reached)
      source.on('close', () => {
        if (limitReached) return; // Already handled
      });

      // Helper function to check if processing is complete
      const checkProcessingComplete = async () => {
        // Processing is complete when:
        // 1. Stream has ended AND
        // 2. Processing queue is empty AND  
        // 3. Not currently processing any item
        if (streamEnded && processingQueue.length === 0 && !isProcessing && !limitReached) {
          // Process any remaining buildings in the final batch
          if (buildingBatch.length > 0) {
            try {
              const batchProcessed = await processBatch(buildingBatch, true);
              
              buildingBatch.forEach(building => {
                existingBuildingIds.add(building.rc14);
                processedBuildings.add(building.rc14);
              });
              
              processed += batchProcessed;
              buildingBatch = [];
              
            } catch (dbError) {
              errorCount += buildingBatch.length;
              logger.error('Final batch processing failed', dbError as Error, { 
                ...logContext, 
                batchSize: buildingBatch.length,
                processed,
                errorCount 
              });
            }
          }

          const duration = Date.now() - startTime;
          logger.info('Processing completed successfully', { 
            ...logContext, 
            processed, 
            skippedDuplicates, 
            errorCount,
            uniqueRCs: seen.size, 
            durationMs: duration 
          });
          
          resolve(NextResponse.json({
            success: true,
            results: {
              processed,
              skippedDuplicates,
              errorCount,
              uniqueRCs: seen.size,
              duration,
              limitReached: false,
              loadDuration,
              existingBuildingsCount: existingBuildingIds.size,
              message: `Successfully processed ${processed} new buildings. Skipped ${skippedDuplicates} duplicates using O(1) in-memory lookups. Encountered ${errorCount} errors. Total unique references: ${seen.size}`
            }
          }));
        }
      };

      // Process features synchronously to avoid async queue explosion
      const processNext = async () => {
        if (isProcessing || processingQueue.length === 0 || limitReached) {
          // Check if we can complete processing after this check
          setImmediate(checkProcessingComplete);
          return;
        }
        if (processed >= maxBuildings) {
          initiateTermination();
          return;
        }

        isProcessing = true;
        const { value } = processingQueue.shift();

        const f = value as {
          type: "Feature";
          properties: any;
          geometry: { type: string; coordinates: any };
        };

        try {
          // 1) RC14
          const rc14: string | undefined = f.properties?.localId || f.properties?.reference || f.properties?.gml_id;
          if (!rc14) {
            isProcessing = false;
            setImmediate(processNext); // Process next item
            return;
          }
          
          // Check both session cache and pre-loaded duplicate set
          if (seen.has(rc14)) {
            skippedDuplicates++;
            isProcessing = false;
            setImmediate(processNext); // Process next item
            return;
          }
          
          // Check if this building already exists using in-memory set (O(1) lookup)
          if (existingBuildingIds.has(rc14)) {
            // Building already exists in database, skip it (NO DATABASE CALL)
            seen.add(rc14); // Add to session cache
            skippedDuplicates++;
            if (skippedDuplicates % 50 === 0) {
              logger.info('Duplicate skip progress', { 
                ...logContext, 
                skippedDuplicates, 
                lastSkipped: rc14 
              });
            }
            isProcessing = false;
            setImmediate(processNext); // Process next item
            return;
          }
          
          // CRITICAL FIX: Only proceed if we haven't reached the limit of NEW buildings
          if (processed >= maxBuildings) {
            initiateTermination();
            return;
          }
          
          
          seen.add(rc14);

          // 2) Apartments and filter fields
          const a = Number(f.properties?.numberOfDwellings ?? f.properties?.numberOfBuildingUnits ?? 0);
          if (!Number.isFinite(a) || a <= 0) {
            isProcessing = false;
            setImmediate(processNext); // Process next item
            return;
          }

          // Extract filter fields
          const currentUse = f.properties?.currentUse ? String(f.properties.currentUse) : undefined;
          const conditionOfConstruction = f.properties?.conditionOfConstruction ? String(f.properties.conditionOfConstruction) : undefined;
          
          // Extract year from date format "1955-01-01T00:00:00" -> 1955
          let beginningYear: number | undefined = undefined;
          if (f.properties?.beginning) {
            const dateString = String(f.properties.beginning);
            const yearMatch = dateString.match(/^\d{4}/); // Get first 4 digits at start
            if (yearMatch) {
              beginningYear = Number(yearMatch[0]);
            }
          }
          
          const numberOfDwellings = f.properties?.numberOfDwellings ? Number(f.properties.numberOfDwellings) : undefined;
          const buildingAreaM2 = f.properties?.value ? Number(f.properties.value) : undefined;

          // 3) Centroid (fix coord order if needed)
          let geom = f.geometry;
          if (!geom) {
            isProcessing = false;
            setImmediate(processNext); // Process next item
            return;
          }

          // Quick coordinate fix for Polygon/MultiPolygon if they came [lat,lon]
          if (geom.type === "Polygon") {
            geom = {
              type: "Polygon",
              coordinates: geom.coordinates.map((ring: any[]) => ring.map(([x, y]: [number, number]) => ensureLonLat([x, y]))),
            };
          } else if (geom.type === "MultiPolygon") {
            geom = {
              type: "MultiPolygon",
              coordinates: geom.coordinates.map((poly: any[]) =>
                poly.map((ring: any[]) => ring.map(([x, y]: [number, number]) => ensureLonLat([x, y])))
              ),
            };
          } else if (geom.type === "Point") {
            geom = { type: "Point", coordinates: ensureLonLat(geom.coordinates) };
          }

          const centroid = turf.centroid({ type: "Feature", properties: {}, geometry: geom as any });
          const [lon, lat] = centroid.geometry.coordinates as [number, number];

          // 4) Limit check moved earlier - this is now redundant but keeping for safety
          if (processed >= maxBuildings) {
            initiateTermination();
            return;
          }

          // Add to batch for processing
          buildingBatch.push({
            rc14,
            apartments: a,
            lon,
            lat,
            address: f.properties?.informationSystem || undefined,
            currentUse,
            conditionOfConstruction,
            beginningYear,
            numberOfDwellings,
            buildingAreaM2,
          });

          // Process batch when it reaches target size OR we've hit the limit
          if (buildingBatch.length >= BATCH_SIZE || processed + buildingBatch.length >= maxBuildings) {
            try {
              // Only process up to the requested limit
              const remainingSlots = maxBuildings - processed;
              const batchToProcess = buildingBatch.slice(0, remainingSlots);
              
              if (batchToProcess.length > 0) {
                const batchProcessed = await processBatch(batchToProcess);
                
                // Add all successfully processed buildings to tracking sets
                batchToProcess.forEach(building => {
                  existingBuildingIds.add(building.rc14);
                  processedBuildings.add(building.rc14);
                });
                
                processed += batchProcessed;
              }
              
              buildingBatch = []; // Clear the batch
              
              // Check if we've reached the limit
              if (processed >= maxBuildings) {
                initiateTermination();
                return;
              }
              
              // Log progress after successful batch
              if (processed % 50 === 0) {
                logger.info('Processing progress', { 
                  ...logContext, 
                  processed, 
                  skippedDuplicates
                });
              }
              
            } catch (dbError) {
              errorCount += buildingBatch.length;
              logger.error('Batch processing failed', dbError as Error, { 
                ...logContext, 
                batchSize: buildingBatch.length,
                processed,
                errorCount 
              });
              
              buildingBatch = []; // Clear failed batch
            }
          }
          
          // Log sample of filter data for early items only (not every item)
          if (processed === 50 && buildingBatch.length === 1) {
            logger.info('Sample filter data', { 
              ...logContext, 
              sampleData: {
                currentUse,
                conditionOfConstruction,
                beginningYear,
                numberOfDwellings,
                buildingAreaM2,
                totalApartments: a
              }
            });
          }

          // Limit check is now done at the beginning of the function

        } catch (e) {
          logger.warn('Skipped feature due to error', { 
            ...logContext, 
            error: (e as Error).message 
          });
        } finally {
          isProcessing = false;
          // Continue processing next item or check if complete
          setImmediate(processNext);
        }
      };

      features.on("data", ({ value }: { value: any }) => {
        // Stop accepting new features if limit reached
        if (limitReached) return;
        
        // Add to processing queue
        processingQueue.push({ value });
        
        // Start processing if not already processing
        processNext();
      });

      features.on("end", () => {
        if (limitReached) return; // Already resolved by terminateProcessing
        
        logger.info('Stream parsing ended', { 
          ...logContext, 
          queueLength: processingQueue.length, 
          currentlyProcessing: isProcessing 
        });
        streamEnded = true;
        
        // Check if processing is complete (queue empty and not processing)
        checkProcessingComplete();
      });

      // Pipeline setup
      pipe(source, jsonParser, pickFeatures, features).catch((error: any) => {
        // Ignore errors when we've intentionally reached the limit
        if (limitReached) {
          logger.info('Expected pipeline close after limit reached', logContext);
          return;
        }
        
        logger.error('Pipeline error', error, logContext);
        resolve(NextResponse.json(
          { error: `Pipeline failed: ${error.message}` },
          { status: 500 }
        ));
      });
    });

  } catch (error) {
    logger.error('Density ingestion error', error as Error, logContext);
    return NextResponse.json(
      { error: 'Failed to process density ingestion' },
      { status: 500 }
    );
  }
}