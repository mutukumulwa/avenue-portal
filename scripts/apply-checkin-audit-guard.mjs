import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to apply the check-in audit guard.");
  process.exit(1);
}

const sql = readFileSync(resolve("prisma/sql/checkin_append_only.sql"), "utf8");
const pool = new Pool({ connectionString });

try {
  await pool.query(sql);
  console.log("Applied CheckInEvent append-only guard.");
} finally {
  await pool.end();
}
