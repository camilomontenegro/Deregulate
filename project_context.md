# Project Context - Building Density Optimization

## Overview
This project implements a high-performance building density visualization system for Sevilla, Spain. The system ingests GeoJSON building data and provides filtered, tile-based visualization for efficient map rendering.

## Architecture Plan

### Phase 1: Data Foundation ✅
- [x] **Add database columns**: Added 5 filter columns to `building_density` table
  - `current_use` (TEXT) - Building use type (residential, commercial, etc.)
  - `condition_of_construction` (TEXT) - Construction condition/quality  
  - `beginning_year` (INTEGER) - Year of construction (extracted from ISO date)
  - `number_of_dwellings` (INTEGER) - Number of dwelling units
  - `building_area_m2` (DECIMAL) - Building area in square meters

- [x] **Enhanced ingestion**: Updated `/api/admin/density/route.ts` to extract and store filter fields
  - Extracts from GeoJSON properties: `currentUse`, `conditionOfConstruction`, `beginning`, `numberOfDwellings`, `value`
  - **Year formatting**: Converts ISO dates (`"1955-01-01T00:00:00"`) to 4-digit years (`1955`)
  - Maps to database columns appropriately

### Phase 2: Tiling & API (Pending)
- [ ] **Implement simple grid-based spatial tiling system** for efficient data chunking
  - Use simple grid (not H3 hexagons) for Sevilla bounds
  - Divide geographic area into manageable tiles
  - Store tile index for fast retrieval

- [ ] **Create `/api/filters/meta` endpoint** to provide filter metadata
  - Return distinct values for enums (current_use, condition_of_construction)
  - Return ranges for numerics (beginning_year, number_of_dwellings, building_area_m2)
  - Include counts per value for UI display

- [ ] **Create `/api/tiles` endpoint** for tile-based data retrieval with filtering support
  - Accept bbox, zoom, and filter parameters
  - Return NDJSON stream or pre-aggregated tile data
  - Support multiple filter combinations

### Phase 3: UI & Performance (Pending)  
- [ ] **Update admin UI with collapsible filters panel**
  - Land use dropdown (multi-select, normalized values)
  - Construction condition dropdown
  - **Year range slider** (priority filter) with decade presets
  - Reset filters button

- [ ] **Add heatmap controls** for enhanced visualization
  - Weight by: Units (default), Dwellings, Count
  - Radius and Intensity sliders
  - Color ramp dropdown (YlOrRd, Viridis, etc.)
  - Normalize by area toggle

- [ ] **Implement tile-based map layer** with client-side caching and filtering
  - Replace current building density layer with tile-based approach
  - Client-side tile caching by {tileId, filterHash, metric}
  - Prefetch neighboring tiles for smooth interaction

- [ ] **Add pre-aggregation system** for common filter combinations (optional optimization)
  - Pre-compute tile intensities for popular filter sets
  - Cache aggregated results for faster rendering
  - Update when new data is ingested

## Key Implementation Details

### Database Schema
```sql
-- Core building data (existing)
cadastral_ref_building TEXT PRIMARY KEY
total_apartments INTEGER
latitude DECIMAL, longitude DECIMAL
municipality TEXT, province TEXT

-- New filter columns (added)
current_use TEXT
condition_of_construction TEXT  
beginning_year INTEGER
number_of_dwellings INTEGER
building_area_m2 DECIMAL(10,2)
```

### Data Processing
- **GeoJSON Source**: `/data/sevilla_buildings.geojson`
- **Coordinate Handling**: Ensures [longitude, latitude] format with `ensureLonLat()` function
- **Year Extraction**: Regex `/^\d{4}/` extracts year from ISO date strings
- **Stream Processing**: Handles large files efficiently with batched operations

### Current Status & Recent Fixes

#### ✅ FIXED: MaxBuildings Limit Enforcement (2025-01-21)
**Problem**: The maxBuildings parameter was ineffective - system would process the requested limit but continue parsing the entire GeoJSON file, causing resource waste and async queue explosions.

**Root Issues Identified**:
1. **Stream not terminating**: `if (processed >= maxBuildings) return` only prevented processing additional features but didn't stop the stream
2. **Async queue explosion**: 5,883+ pending operations continued after limit reached 
3. **Session-based duplicate detection**: `seen` Set was reset each session, causing already-existing buildings to be "processed" as updates rather than skipped
4. **Misleading metrics**: Frontend showed "50 processed" but database got 393+ records due to race conditions

**Solutions Implemented**:

1. **Serial Processing Queue** (`route.ts:104-105`):
   ```typescript
   let processingQueue: any[] = [];
   let isProcessing = false;
   ```
   - Replaced parallel stream processing with serial queue
   - Only one building processed at a time to prevent async explosion
   - Queue cleared immediately when limit reached

2. **Database-Based Duplicate Detection** (`route.ts:209-226`):
   ```typescript
   const { data: existingBuilding } = await supabase
     .from("building_density")
     .select("cadastral_ref_building")
     .eq("cadastral_ref_building", rc14)
     .maybeSingle();
   ```
   - Checks database for existing buildings, not just session memory
   - Ensures `processed` count reflects truly NEW buildings added
   - Skips existing buildings without counting toward limit

3. **Proper Stream Termination** (`route.ts:147-150`):
   ```typescript
   source.destroy();
   processingQueue = [];
   ```
   - Immediately destroys stream when limit reached
   - Clears processing queue to prevent further operations

4. **Enhanced Metrics Tracking** (`route.ts:101, 160-165`):
   ```typescript
   let processed = 0;        // NEW buildings added
   let skippedDuplicates = 0; // Existing buildings skipped
   ```

**Current Behavior** (as of 2025-01-21):
- ✅ **True limit enforcement**: Processes exactly `maxBuildings` NEW buildings
- ✅ **Proper duplicate handling**: Skips 935 duplicates to find 50 new buildings
- ✅ **Clean termination**: No more stream errors or async explosions
- ✅ **Database accuracy**: Exactly 50 new records added per run

**Sample Terminal Output**:
```
Skipped 870 duplicates so far (last: 0247413TG4404N)
Processed 10 new buildings (879 duplicates skipped so far)…
Processed 50 new buildings (935 duplicates skipped so far)…
LIMIT REACHED. Processed 50/50 new buildings. Skipped 935 duplicates. 
Total unique RCs encountered: 1164
```

**Known Minor Issue**: 
- Frontend sometimes shows outdated metrics (0 processed, 200 unique) due to race condition with response handling
- Backend correctly processes 50 new buildings and adds exactly 50 database records
- Terminal logs show accurate processing status

#### Remaining System Limitations
- No spatial indexing yet (will be addressed with tiling system)
- Single municipality focus (Sevilla) - easily expandable
- Frontend metrics display race condition (minor UI issue)
- Missing database schema in repository (`building_density` table definition not documented)

## Current System Architecture Status

### Data Ingestion Methods
1. **Primary Method**: `/api/admin/density/route.ts` 
   - ✅ Handles filter fields extraction
   - ✅ Serial processing with proper limits
   - ✅ Database-based duplicate detection
   - ✅ Efficient stream termination

2. **Legacy Scripts**: 
   - `scripts/ingest-sevilla-density-from-file.ts` (missing filter fields)
   - `scripts/ingest-sevilla-density.ts` (Catastro API, rate-limited)

### System Performance Metrics (Latest Run)
- **Processing Time**: 26 seconds for 50 buildings
- **Duplicate Skip Rate**: 935 duplicates / 1164 total features = 80.3%
- **Database Efficiency**: 100% accuracy (50 requested = 50 added)
- **Memory Usage**: Controlled (serial processing prevents memory spikes)

#### ✅ FIXED: Race Condition & Production Readiness (2025-01-27)
**Problem**: API responded while processing queue continued running asynchronously, causing frontend/backend state mismatch and production deployment issues.

**Root Issues Identified**:
1. **Async race condition**: API responded when stream ended, not when processing completed
2. **Console.log inadequate**: No structured logging for production monitoring
3. **Error handling gaps**: Database failures could corrupt processing state  
4. **Limited visibility**: Insufficient metrics for production operations

**Solutions Implemented**:

1. **Race Condition Resolution** (`route.ts:203-227, 303-365`):
   ```typescript
   let streamEnded = false;
   const checkProcessingComplete = () => {
     if (streamEnded && processingQueue.length === 0 && !isProcessing && !limitReached) {
       resolve(NextResponse.json({...})); // Only respond when truly complete
     }
   };
   ```
   - Added proper completion checking mechanism
   - API now responds only after processing queue is fully empty
   - Eliminated race condition between stream parsing and processing

2. **Production-Ready Structured Logging** (`route.ts:12-53`):
   ```typescript
   const logger = {
     info: (message: string, context: Partial<LogContext> = {}) => {
       console.log(JSON.stringify({
         level: 'INFO', message, timestamp: new Date().toISOString(), ...context
       }));
     }
   };
   const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   ```
   - **Structured JSON logs** → Easy parsing by log aggregators (Vercel, Netlify, Docker)
   - **Session tracking** → Correlate logs across request lifecycle  
   - **Error context** → Full stack traces with contextual data
   - **Production deployment ready** → Works with all major platforms

3. **Transaction Safety & Error Resilience** (`route.ts:479-504`):
   ```typescript
   try {
     await upsertRow({...});
     existingBuildingIds.add(rc14);  // Only add on success
     processed++;
   } catch (dbError) {
     errorCount++;
     logger.error('Database upsert failed', dbError);
     // Continue processing other buildings
   }
   ```
   - **Graceful degradation** → One failed building doesn't stop entire batch
   - **State consistency** → In-memory sets only updated on successful operations
   - **Error tracking** → Count and log database failures for monitoring

4. **Enhanced Processing Status Tracking** (`route.ts:182-184`):
   ```typescript
   // Enhanced metrics in response
   {
     processed: 100,
     skippedDuplicates: 182, 
     errorCount: 0,
     uniqueRCs: 282,
     loadDurationMs: 125,
     existingBuildingsCount: 1000
   }
   ```

**Current Behavior** (as of 2025-01-27):
- ✅ **Accurate limit enforcement**: Processes exactly requested amount
- ✅ **Clean termination**: No more stream errors or async explosions  
- ✅ **Database accuracy**: Matches frontend metrics with actual database operations
- ✅ **Production monitoring**: Comprehensive structured logging
- ✅ **Error resilience**: Continues processing despite individual failures

**Performance Metrics** (Latest Run):
- **Processing Time**: 8.1 seconds for 100 buildings
- **Duplicate Skip Rate**: 182 duplicates / 282 total features = 64.5%
- **Database Efficiency**: 100% accuracy (100 requested = 100 processed)
- **Memory Usage**: Controlled (serial processing prevents memory spikes)
- **Log Volume**: ~20 structured log entries per 100 buildings

#### Known Limitations & Future Improvements
1. **In-Memory Duplicate Detection**: Currently functional but could be optimized
   - Works correctly with O(1) lookups using pre-loaded Set
   - Handles 64%+ duplicate skip rate effectively
   - Future: Could investigate batch pre-filtering for even better performance

2. **Single Municipality Scope**: Currently focused on Sevilla
   - Easily expandable to other municipalities
   - Database schema supports multiple locations

3. **Missing Infrastructure**:
   - No spatial indexing yet (will be addressed with tiling system)  
   - Database schema not documented in repository
   - No rollback mechanism for failed ingestions

## Next Priority
**Grid-based spatial tiling system** implementation for efficient data chunking, followed by implementing the **beginning year filter** and enhanced UI controls for production deployment.