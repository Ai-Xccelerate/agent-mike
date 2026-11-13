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
    // The switched-off features (lib/features.ts) are on for the tests that cover them; tests/features-off.test.ts turns them off.
    env: { FEATURE_CANNED_REPLIES: "true", FEATURE_TEST_CASES: "true", FEATURE_SUGGESTED_REPLIES: "true" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
