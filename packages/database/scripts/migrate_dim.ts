import { config } from "dotenv";
config({ path: "C:/Users/dpereira/Documents/github/ds-team/.env" });
import pg from "pg";

const { Pool } = pg;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.delete("channel_binding");
const pool = new Pool({ connectionString: url.toString() });

try {
  await pool.query("ALTER TABLE \"memories\" ALTER COLUMN \"embedding\" SET DATA TYPE vector(1536)");
  console.log("✓ vector(768) → vector(1536)");
} catch (err: unknown) {
  console.error("Error:", err instanceof Error ? err.message : String(err));
} finally {
  await pool.end();
}
