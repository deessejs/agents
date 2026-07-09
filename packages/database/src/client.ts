import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

// Lazy singleton — neon() is called at first access, not at module load time.
// This avoids build-time errors when DATABASE_URL is not set during `eve build`.
let _db: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle({ client: neon(url), schema });
  }
  return _db;
}
