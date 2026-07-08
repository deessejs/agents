/**
 * Migration runner — applies all SQL files in drizzle/ to Neon.
 * Handles the Neon pooler quirks (strips channel_binding, uses pg driver).
 *
 * Usage: pnpm --filter @ds-team/database exec tsx scripts/migrate.ts
 */
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

// Load .env from monorepo root (one level up from packages/database)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { config } = await import("dotenv");
config({ path: path.resolve(__dirname, "../../../.env") });

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL not set");
const dbUrl = new URL(rawUrl);
dbUrl.searchParams.delete("channel_binding");

const pool = new pg.Pool({ connectionString: dbUrl.toString() });

const drizzleDir = path.join(__dirname, "../drizzle");
const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort();

// Ensure pgvector is available
await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

for (const file of files) {
  const sql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
  // Split on --> statement-breakpoint (drizzle's migration separator)
  const blocks = sql.split(/-->/u);
  for (let i = 0; i < blocks.length - 1; i++) {
    let stmt = blocks[i].trim();
    // Skip empty blocks or blocks that are only the separator comment
    if (!stmt) continue;
    // Skip blocks that are pure statement-breakpoint (possibly with leading whitespace/newlines)
    if (/^\s*statement-breakpoint\s*$/.test(stmt)) continue;
    // Skip blocks that START with statement-breakpoint (mix of separator + next statement - shouldn't happen but safety)
    if (stmt.startsWith("statement-breakpoint")) continue;
    // Ensure statement ends with semicolon
    if (!stmt.endsWith(";")) stmt += ";";
    try {
      await pool.query(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate_object")) continue;
      throw new Error(`[${file}] ${msg}`);
    }
  }
  console.log(`✓ ${file}`);
}

await pool.end();
console.log("\n✓ All migrations applied");
