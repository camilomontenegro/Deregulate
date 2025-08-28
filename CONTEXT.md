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

### 2. Map Display Limitation - Only Shows 1000 of 5445 Records
**Status**: Under investigation

**Problem**:
- Database has 5445 records in `building_density` table
- Map component only displays 1000 records
- Likely has a hardcoded limit or pagination issue

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