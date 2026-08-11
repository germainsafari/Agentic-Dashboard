/**
 * One-off verification: Postgres + Redis snapshot state.
 * Usage: node scripts/verify-persistence.mjs
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";

const sql = neon(process.env.DATABASE_URL);

console.log("=== POSTGRES ===");
const countRows = await sql`SELECT COUNT(*)::int AS count FROM director_snapshots`;
console.log("director_snapshots count:", countRows[0].count);

const directors = await sql`
  SELECT director_id, fetched_at, updated_at,
         jsonb_array_length(payload->'teamStats') AS team_count
  FROM director_snapshots
  ORDER BY director_id
`;
for (const d of directors) console.log(JSON.stringify(d));

const meta = await sql`SELECT * FROM sync_meta WHERE id = 1`;
console.log("sync_meta:", JSON.stringify(meta[0] ?? null));

console.log("\n=== REDIS ===");
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const keys = await redis.keys("snapshot:*");
console.log("snapshot keys:", keys.length);
for (const k of keys.sort()) console.log(" ", k);
const metaKey = await redis.get("sync:meta");
console.log("sync:meta:", metaKey ? JSON.stringify(metaKey) : null);
if (keys[0]) {
  const sample = await redis.get(keys[0]);
  console.log("sample", keys[0], "fetchedAt:", sample?.fetchedAt);
}
