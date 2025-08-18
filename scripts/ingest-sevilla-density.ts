// scripts/ingest-sevilla-density.ts
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { limiter, resolveRCByPoint, getApartmentCountByRC } from "../app/lib/catastro/ovc";
import * as turf from "@turf/turf";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";

const pipe = promisify(pipeline);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);

// Safety caps
const MAX_BUILDINGS = Number(process.env.MAX_BUILDINGS ?? 200); // process N buildings per run
const DEDUPE = new Set<string>();
let processed = 0;

type Feature = {
  type: "Feature";
  geometry: any;
  properties?: Record<string, any>;
};

async function upsert(rc: string, lat: number, lon: number, d: any) {
  await supabase.from("building_density").upsert({
    cadastral_ref_building: rc,
    total_apartments: d.apartments,
    building_address: d.address ?? "",
    latitude: lat,
    longitude: lon,
    municipality: d.municipality ?? "Sevilla",
    province: d.province ?? "Sevilla",
    last_updated: new Date().toISOString(),
    raw_cadastral_data: d.raw
  }, { onConflict: "cadastral_ref_building" });
}

async function run() {
  const file = path.resolve(process.cwd(), "data/sevilla_buildings.geojson");

  const source = fs.createReadStream(file, { encoding: "utf8" });
  const jsonParser = parser();              // parses the big JSON stream
  const features = streamArray();           // iterates items in FeatureCollection.features

  features.on("data", async ({ value }: { value: Feature }) => {
    if (processed >= MAX_BUILDINGS) return;

    try {
      // centroid (GeoJSON is already EPSG:4326, RFC7946)
      const c = turf.centroid(value).geometry.coordinates as [number, number];
      const [lon, lat] = c;

      // resolve RC and apartments (both rate-limited)
      const rc = await limiter.schedule(() => resolveRCByPoint(lat, lon));
      if (!rc || DEDUPE.has(rc)) return;
      DEDUPE.add(rc);

      const detail = await limiter.schedule(() => getApartmentCountByRC(rc));
      if (!detail) return;

      await upsert(rc, lat, lon, detail);
      processed++;
      if (processed % 25 === 0) {
        console.log(`Processed ${processed} buildings… (last RC ${rc})`);
      }
    } catch (e) {
      // keep going on individual errors
      console.warn("Skipped feature error:", (e as Error).message);
    }
  });

  features.on("end", () => {
    console.log(`DONE. Upserted ~${processed} buildings. Unique RCs: ${DEDUPE.size}`);
  });

  await pipe(source, jsonParser, features);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});