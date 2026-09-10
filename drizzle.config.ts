import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";

if (!process.env.DATABASE_URL) {
  if (existsSync(".env.local")) loadEnv({ path: ".env.local" });
  else loadEnv({ path: ".env" });
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
