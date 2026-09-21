import { defineConfig } from "vitest/config";
import path from "path";
import { existsSync } from "fs";
import { config as loadEnv } from "dotenv";

if (existsSync(".env.local")) loadEnv({ path: ".env.local" });
else loadEnv({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
