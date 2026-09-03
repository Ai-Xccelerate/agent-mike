import { afterEach, describe, expect, it } from "vitest";
import { assertLocalBypassSafe, isLocalUnauthEnabled, localBypassRequested } from "@/lib/env";

const KEYS = [
  "MIKE_ALLOW_LOCAL_UNAUTH",
  "APP_ENV",
  "NODE_ENV",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
];

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("local Clerk bypass", () => {
  it("stays disabled unless every local-only condition is set", () => {
    process.env.MIKE_ALLOW_LOCAL_UNAUTH = "true";
    process.env.APP_ENV = "local";
    process.env.NODE_ENV = "development";
    delete process.env.RAILWAY_ENVIRONMENT;
    expect(isLocalUnauthEnabled()).toBe(true);
  });

  it("does not enable when APP_ENV is not local", () => {
    process.env.MIKE_ALLOW_LOCAL_UNAUTH = "true";
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "development";
    delete process.env.RAILWAY_ENVIRONMENT;
    expect(() => isLocalUnauthEnabled()).toThrow(/not allowed in staging or production/);
  });

  it("throws if the bypass flag is set on Railway", () => {
    process.env.MIKE_ALLOW_LOCAL_UNAUTH = "true";
    process.env.APP_ENV = "local";
    process.env.NODE_ENV = "development";
    process.env.RAILWAY_ENVIRONMENT = "staging";
    expect(() => assertLocalBypassSafe()).toThrow(/not allowed in staging or production/);
    expect(localBypassRequested()).toBe(true);
  });

  it("stays off in NODE_ENV=production even locally", () => {
    process.env.MIKE_ALLOW_LOCAL_UNAUTH = "true";
    process.env.APP_ENV = "local";
    process.env.NODE_ENV = "production";
    delete process.env.RAILWAY_ENVIRONMENT;
    expect(isLocalUnauthEnabled()).toBe(false);
  });
});
