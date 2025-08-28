const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const { createClient } = require("@supabase/supabase-js");
const turf = require("@turf/turf");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

const pipe = promisify(pipeline);

// --- Supabase ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Safety caps for testing; remove/increase later
const MAX_BUILDINGS = Number(process.env.MAX_BUILDINGS ?? 500);

// Some files came out as [lat, lon]. Detect & fix.
function ensureLonLat([a, b]: [number, number]): [number, number] {
  // if first value is in lat range and second looks like lon → swap
  const looksLatLon = (Math.abs(a) <= 90 && Math.abs(b) <= 180);
  const inSevillaIfSwapped = (b > -6.2 && b < -5.6) && (a > 37.2 && a < 37.6);
  if (looksLatLon && inSevillaIfSwapped) return [b, a]; // swap → [lon, lat]
  return [a, b]; // already [lon, lat]
}

async function upsertRow({
  rc14,
  apartments,
  lon,
  lat,
  address,
}: {
  rc14: string;
  apartments: number;
  lon: number;
  lat: number;
  address?: string;
}) {
  await supabase.from("building_density").upsert(
    {
      cadastral_ref_building: rc14,
      total_apartments: apartments,
      building_address: address ?? "",
      latitude: lat,
      longitude: lon,
      municipality: "Sevilla",
      province: "Sevilla",
      last_updated: new Date().toISOString(),
      raw_cadastral_data: null, // optional: store subset of properties if you want
    },
    { onConflict: "cadastral_ref_building" }
  );
}

async function run() {
  const file = path.resolve("data/sevilla_buildings.geojson");
  
  console.log(`🎲 Starting GEOGRAPHIC STRATIFIED SAMPLING ingestion from: ${file}`);
  console.log(`📊 Target sample size: ${MAX_BUILDINGS} buildings`);
  console.log(`🗺️  Method: ${GRID_SIZE}x${GRID_SIZE} grid zones, ~${BUILDINGS_PER_ZONE} buildings per zone`);
  console.log(`📍 Ensures even spatial distribution across entire city!\n`);
  
  // Try a simpler approach - load a small chunk first to test
  console.log('Reading file...');
  
  const source = fs.createReadStream(file, { encoding: "utf8" });
  const jsonParser = parser();
  const pickFeatures = pick({ filter: 'features' });
  const features = streamArray();

  let processed = 0;
  let totalSeen = 0;
  const seen = new Set<string>();
  
  // Geographic stratified sampling: divide city into grid zones
  const GRID_SIZE = 10; // 10x10 grid = 100 zones
  const BUILDINGS_PER_ZONE = Math.ceil(MAX_BUILDINGS / (GRID_SIZE * GRID_SIZE));
  const zoneReservoirs = new Map<string, any[]>(); // zone -> buildings in that zone
  
  // Sevilla bounds for zone calculation
  const BOUNDS = {
    north: 37.45,
    south: 37.32,
    east: -5.85,
    west: -6.05
  };

  // Add error handling
  source.on('error', (err: any) => {
    console.error('File read error:', err);
    process.exit(1);
  });
  
  jsonParser.on('error', (err: any) => {
    console.error('JSON parsing error:', err);
    console.error('This might be due to file corruption or encoding issues');
    process.exit(1);
  });
  
  pickFeatures.on('error', (err: any) => {
    console.error('Pick filter error:', err);
    process.exit(1);
  });
  
  features.on('error', (err: any) => {
    console.error('Stream array error:', err);
    process.exit(1);
  });

  features.on("data", async ({ value }: { value: any }) => {
    const f = value as {
      type: "Feature";
      properties: any;
      geometry: { type: string; coordinates: any };
    };

    // 1) RC14
    const rc14: string | undefined = f.properties?.localId || f.properties?.reference || f.properties?.gml_id;
    if (!rc14) return;
    if (seen.has(rc14)) return; // dedupe
    seen.add(rc14);

    // 2) Apartments
    const a = Number(f.properties?.numberOfDwellings ?? f.properties?.numberOfBuildingUnits ?? 0);
    if (!Number.isFinite(a) || a <= 0) return; // skip non-residential / unknown

    // Optional: filter to residential only
    const use = String(f.properties?.currentUse ?? "").toLowerCase();
    if (use && !use.includes("residential")) return; // comment out if you want all uses

    // 3) Centroid (fix coord order if needed)
    let geom = f.geometry;
    if (!geom) return;

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

    // 4) Geographic stratified sampling: assign building to zone
    const buildingData = {
      rc14,
      apartments: a,
      lon,
      lat,
      address: f.properties?.informationSystem || undefined,
    };

    totalSeen++;

    // Calculate which zone this building belongs to
    const latStep = (BOUNDS.north - BOUNDS.south) / GRID_SIZE;
    const lngStep = (BOUNDS.east - BOUNDS.west) / GRID_SIZE;
    
    const zoneX = Math.min(Math.floor((lon - BOUNDS.west) / lngStep), GRID_SIZE - 1);
    const zoneY = Math.min(Math.floor((lat - BOUNDS.south) / latStep), GRID_SIZE - 1);
    const zoneKey = `${zoneX},${zoneY}`;
    
    // Get or create reservoir for this zone
    if (!zoneReservoirs.has(zoneKey)) {
      zoneReservoirs.set(zoneKey, []);
    }
    const zoneReservoir = zoneReservoirs.get(zoneKey)!;
    
    // Reservoir sampling within this zone
    if (zoneReservoir.length < BUILDINGS_PER_ZONE) {
      zoneReservoir.push(buildingData);
    } else {
      // Replace random building in this zone
      const randomIndex = Math.floor(Math.random() * zoneReservoir.length);
      zoneReservoir[randomIndex] = buildingData;
    }

    if (totalSeen % 1000 === 0) {
      const totalSampled = Array.from(zoneReservoirs.values()).reduce((sum, zone) => sum + zone.length, 0);
      console.log(`Processed ${totalSeen} buildings, sampled: ${totalSampled} across ${zoneReservoirs.size} zones`);
    }
  });

  features.on("end", async () => {
    console.log(`\n📊 Geographic sampling complete! Processed ${totalSeen} total buildings.`);
    console.log(`🗺️  Found buildings in ${zoneReservoirs.size} different zones.`);
    
    // Flatten all zone reservoirs into final sample
    const allSampled: any[] = [];
    for (const [zoneKey, zoneBuildings] of zoneReservoirs.entries()) {
      console.log(`Zone ${zoneKey}: ${zoneBuildings.length} buildings`);
      allSampled.push(...zoneBuildings);
    }
    
    console.log(`🎲 Total selected: ${allSampled.length} geographically distributed buildings.\n`);
    
    // Now process the geographically sampled buildings
    for (const building of allSampled) {
      await upsertRow(building);
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`Upserted ${processed}/${allSampled.length} sampled buildings…`);
      }
    }
    
    console.log(`\n✅ DONE! Inserted/updated ${processed} geographically distributed buildings.`);
    console.log(`📍 Distribution: Up to ${BUILDINGS_PER_ZONE} buildings per zone across ${GRID_SIZE}x${GRID_SIZE} grid.`);
  });

  // Pipeline setup
  await pipe(source, jsonParser, pickFeatures, features);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});