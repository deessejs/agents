import { config } from "dotenv";
config({ path: "C:/Users/dpereira/Documents/github/ds-team/.env" });
import pg from "pg";

const { Pool } = pg;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.delete("channel_binding");
const pool = new Pool({ connectionString: url.toString() });

try {
  const r = await pool.query(
    `SELECT attname, format_type(atttypid, atttypmod) as type
     FROM pg_attribute WHERE attrelid = 'memories'::regclass AND attname = 'embedding'`,
  );
  console.log("embedding:", JSON.stringify(r.rows[0]));
} finally {
  await pool.end();
}
