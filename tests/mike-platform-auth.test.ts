import { afterEach, describe, expect, it } from "vitest";
import { platformAuthRequired } from "@/lib/clerk-core-auth";
import { ClerkCoreIdentityAdapter } from "@/lib/identity";

const saved = {
  railway: process.env.RAILWAY_ENVIRONMENT,
  app: process.env.APP_ENV,
  explicit: process.env.MIKE_PLATFORM_AUTH,
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    const envName =
      key === "railway"
        ? "RAILWAY_ENVIRONMENT"
        : key === "app"
          ? "APP_ENV"
          : "MIKE_PLATFORM_AUTH";
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  }
});

function request(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Parameters<ClerkCoreIdentityAdapter["resolveManagerRequest"]>[0];
}

describe("Mike platform identity", () => {
  it("uses only middleware-verified tenant headers", async () => {
    const tenant = await new ClerkCoreIdentityAdapter().resolveManagerRequest(
      request({
        "x-aix-verified-org-id": "org_mike",
        "x-aix-verified-user-id": "user_mike",
        "x-aix-verified-role": "owner",
      }),
    );
    expect(tenant).toEqual({
      orgId: "org_mike",
      userId: "user_mike",
      role: "owner",
      source: "clerk-core",
    });
  });

  it("fails closed when verified context is absent", async () => {
    await expect(
      new ClerkCoreIdentityAdapter().resolveManagerRequest(request({})),
    ).rejects.toThrow("Verified Clerk tenant context is missing");
  });

  it("always requires platform auth on Railway, but local use is opt-in", () => {
    delete process.env.RAILWAY_ENVIRONMENT;
    process.env.APP_ENV = "local";
    delete process.env.MIKE_PLATFORM_AUTH;
    expect(platformAuthRequired()).toBe(false);

    process.env.MIKE_PLATFORM_AUTH = "true";
    expect(platformAuthRequired()).toBe(true);

    delete process.env.MIKE_PLATFORM_AUTH;
    process.env.RAILWAY_ENVIRONMENT = "staging";
    expect(platformAuthRequired()).toBe(true);
  });
});
