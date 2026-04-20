/**
 * Supabase Postgres connection via postgres-js.
 * prepare: false is REQUIRED for Supabase's transaction-mode pgbouncer
 * pooler (port 6543). Without it, queries silently return stale/empty data.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.warn("[db] Neither SUPABASE_DATABASE_URL nor DATABASE_URL is set");
    return null;
  }

  try {
    _client = postgres(url, {
      ssl: { rejectUnauthorized: false },
      max: 5,
      prepare: false,
    });
    _db = drizzle(_client);
    console.log("[db] Connected to Supabase Postgres");
    return _db;
  } catch (err) {
    console.error("[db] Failed to connect:", err);
    return null;
  }
}
