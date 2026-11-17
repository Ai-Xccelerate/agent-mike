import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** The whole suite, with this process's clock shifted by SKEW_MS (default 90 seconds ahead). See tests/support/clock-skew.setup.ts. */
export default mergeConfig(base, defineConfig({ test: { setupFiles: ["./tests/support/clock-skew.setup.ts"] } }));
