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
  try {
    const body = await request.json();
    const { maxBuildings = 500 } = body;

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
          raw_cadastral_data: null,
        },
        { onConflict: "cadastral_ref_building" }
      );
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
      const seen = new Set<string>();
      const startTime = Date.now();

      // Add error handling
      source.on('error', (err: any) => {
        console.error('File read error:', err);
        resolve(NextResponse.json(
          { error: `File read failed: ${err.message}` },
          { status: 500 }
        ));
      });
      
      jsonParser.on('error', (err: any) => {
        console.error('JSON parsing error:', err);
        resolve(NextResponse.json(
          { error: `JSON parsing failed: ${err.message}` },
          { status: 500 }
        ));
      });
      
      pickFeatures.on('error', (err: any) => {
        console.error('Pick filter error:', err);
        resolve(NextResponse.json(
          { error: `Pick filter failed: ${err.message}` },
          { status: 500 }
        ));
      });
      
      features.on('error', (err: any) => {
        console.error('Stream array error:', err);
        resolve(NextResponse.json(
          { error: `Stream array failed: ${err.message}` },
          { status: 500 }
        ));
      });

      features.on("data", async ({ value }: { value: any }) => {
        if (processed >= maxBuildings) return;

        const f = value as {
          type: "Feature";
          properties: any;
          geometry: { type: string; coordinates: any };
        };

        try {
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

          // 4) Upsert
          await upsertRow({
            rc14,
            apartments: a,
            lon,
            lat,
            address: f.properties?.informationSystem || undefined,
          });

          processed++;
          if (processed % 100 === 0) {
            console.log(`Upserted ${processed} buildings…`);
          }
        } catch (e) {
          console.warn("Skipped feature error:", (e as Error).message);
        }
      });

      features.on("end", () => {
        const duration = Date.now() - startTime;
        console.log(`DONE. Inserted/updated ~${processed}. Unique RCs: ${seen.size}`);
        
        resolve(NextResponse.json({
          success: true,
          results: {
            processed,
            uniqueRCs: seen.size,
            duration,
            message: `Successfully processed ${processed} buildings with ${seen.size} unique cadastral references`
          }
        }));
      });

      // Pipeline setup
      pipe(source, jsonParser, pickFeatures, features).catch((error: any) => {
        console.error("Pipeline error:", error);
        resolve(NextResponse.json(
          { error: `Pipeline failed: ${error.message}` },
          { status: 500 }
        ));
      });
    });

  } catch (error) {
    console.error('Density ingestion error:', error);
    return NextResponse.json(
      { error: 'Failed to process density ingestion' },
      { status: 500 }
    );
  }
}