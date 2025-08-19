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

### Current Limitations
- MaxBuildings limit enforcement needs improvement (currently processes more than requested)
- No spatial indexing yet (will be addressed with tiling system)
- Single municipality focus (Sevilla) - easily expandable

## Next Priority
**Beginning year filter** is the highest priority filter to implement first, followed by the grid tiling system for performance optimization.