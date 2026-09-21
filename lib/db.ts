import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __workerDbPool: Pool | undefined;
}

const pool =
  global.__workerDbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__workerDbPool = pool;
}

export const db = drizzle(pool, { schema });
