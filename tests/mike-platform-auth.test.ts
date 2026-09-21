import { createHmac } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { platformAuthRequired } from "@/lib/clerk-core-auth";
import { ClerkCoreIdentityAdapter } from "@/lib/identity";
import { verifyNylasWebhook } from "@/lib/nylas-inbound";

const saved = {
  railway: process.env.RAILWAY_ENVIRONMENT,
  app: process.env.APP_ENV,
  explicit: process.env.MIKE_PLATFORM_AUTH,
  webhook: process.env.NYLAS_WEBHOOK_SECRET,
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    const envName =
      key === "railway"
        ? "RAILWAY_ENVIRONMENT"
        : key === "app"
          ? "APP_ENV"
          : key === "explicit"
            ? "MIKE_PLATFORM_AUTH"
            : "NYLAS_WEBHOOK_SECRET";
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

describe("Nylas webhook contract", () => {
  it("accepts the matching HMAC and rejects a different signature", () => {
    process.env.NYLAS_WEBHOOK_SECRET = "test-webhook-secret";
    const payload = Buffer.from('{"type":"message.created"}');
    const valid = createHmac("sha256", process.env.NYLAS_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");
    expect(verifyNylasWebhook(payload, new Headers({ "x-nylas-signature": valid }))).toBe(true);
    expect(
      verifyNylasWebhook(payload, new Headers({ "x-nylas-signature": "0".repeat(64) })),
    ).toBe(false);
  });
});
