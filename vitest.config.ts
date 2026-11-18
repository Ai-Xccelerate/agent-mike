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
    // Several tests do real work (a database, a connector that retries a closed port) and take 2-4 s; the 5 s default left them
    // one slow moment from failing. A test that hangs still fails, just later.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // The switched-off features (lib/features.ts) are on for the tests that cover them; tests/features-off.test.ts turns them off.
    env: {
      FEATURE_CANNED_REPLIES: "true",
      FEATURE_TEST_CASES: "true",
      FEATURE_SUGGESTED_REPLIES: "true",
      // No live model in tests. With a real key in .env.local and DEMO_MODE=false, the ticket path (handoff summary, ticket
      // classifier, routing) made real OpenAI calls that no test mocked: those tests took 3-4 s against a 5 s limit and timed
      // out whenever the API was slow, and one run hung for half an hour. A test that needs the model mocks it and sets its own key.
      OPENAI_API_KEY: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
