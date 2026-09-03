import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: url });

export const db = drizzle(pool, { schema });
export type DB = typeof db;
