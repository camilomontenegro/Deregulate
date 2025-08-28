# Project Context and Known Issues

## Current Issues

### 1. Building Density Ingestion - Batch Processing Failure
**Location**: `app/api/admin/density/route.ts`
**Status**: Not working consistently

**Problem**: 
- Individual database upserts work (visible in logs as "Batch upsert successful") 
- However, records don't appear in the database table
- Issue occurs for both small batches (100 records) and larger ones (500+)
- Sometimes works for 500+ records but not reliably

**Symptoms**:
- Logs show successful batch processing and commits
- Database queries return no new records after ingestion
- Same issue persists after switching from individual upserts to batch processing

**Technical Details**:
- Using Supabase `.upsert()` with `onConflict: "cadastral_ref_building"`
- Proper error handling shows no database errors
- Transaction boundaries implemented but records still don't persist
- May be related to Supabase RLS policies, connection handling, or transaction isolation

**Workaround**: None currently - ingestion is unreliable

### 2. ✅ Map Display Limitation - SOLVED
**Status**: Resolved with server-side density grid

**Solution Implemented**:
- **City-wide density visualization**: Server processes ALL 50k buildings into spatial grid
- **Efficient API endpoint**: `/api/density-grid` returns ~40x40 grid cells instead of individual buildings  
- **Single request**: Loads entire city density in one API call (~500 grid cells vs 50k points)
- **Scalable architecture**: Works for any city size, ready for multi-city deployment

**Performance Benefits**:
- **Data transfer**: ~50KB grid response vs ~5MB individual buildings
- **Rendering**: ~1,600 grid cells vs 50,000 individual points
- **Server processing**: ~200-500ms to aggregate all buildings server-side
- **User experience**: Instant city-wide density view

**Recent Fixes Applied**:
- **Fixed heatmap weight scaling**: Updated from 0-500 to 0-1000 range to handle grid-aggregated apartment counts
- **Increased visibility settings**: Larger radius (50px), higher intensity (1.2), better opacity (0.8)
- **Added debugging logs**: Console shows grid cell data being processed
- **Updated UI display**: Shows "X grid cells" instead of estimated building count

### 3. Geographic Sampling for Data Ingestion - NEEDS WORK
**Location**: `scripts/ingest-sevilla-density-from-file.ts`
**Status**: Implementation attempted but not working properly

**Problem**: 
- User requested randomized building ingestion to get geographic diversity
- Initial reservoir sampling implementation still produced same geographic clusters
- When requesting 50k buildings from ~50k total dataset, getting nearly entire dataset regardless of randomization
- Need truly random geographic distribution, not just random order of same buildings

**Solutions Attempted**:
1. **Simple Reservoir Sampling**: Random sampling across entire dataset - insufficient for geographic diversity
2. **Geographic Stratified Sampling**: Divide city into 10x10 grid (100 zones), sample evenly from each zone
   - Target: ~500 buildings per zone for 50k total
   - Should ensure citywide coverage including suburban areas
   - Implementation completed but user reports it's not working properly

**Current Issue**: Geographic stratified sampling implementation may have bugs in zone calculation or sampling logic

**Technical Details**:
- Uses Sevilla bounds: north: 37.45, south: 37.32, east: -5.85, west: -6.05
- Calculates zone indices based on lat/lng coordinates
- Maintains separate reservoirs for each geographic zone
- DEFAULT_MAX_BUILDINGS = 500 if environment variable not set (common source of confusion)

**Next Steps Needed**:
- Debug zone calculation algorithm
- Verify buildings are being distributed across all zones
- Test with smaller sample sizes to verify geographic distribution
- Consider alternative sampling strategies (e.g., distance-based sampling)

## Architecture Notes

### Data Processing Approaches
- **File-based ingestion** (working): Processes GeoJSON properties directly from `sevilla_buildings.geojson`
- **~~Catastro API ingestion~~** (removed): Was rate-limited and unreliable - completely removed from codebase

### Database Schema
- **Properties table**: `houses` - Used for Idealista scraped data  
- **Building density table**: `building_density` - Used for cadastral building data
- Both use upsert patterns to handle duplicates

### Removed Components
- `scripts/ingest-sevilla-density.ts` - Catastro API approach (deleted)
- `app/lib/catastro/ovc.ts` - Rate-limited API client (deleted)
- `bottleneck` dependency - Only used for API rate limiting (removed)