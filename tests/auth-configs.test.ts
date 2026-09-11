import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID = ORIGINAL;
  vi.resetModules();
});

describe("auth config lookup", () => {
  it("returns the Zoho auth config id from env", async () => {
    process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID = "ac_test_zoho";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("zoho")).toBe("ac_test_zoho");
  });

  it("throws when the system is unmapped", async () => {
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(() => getAuthConfigId("hubspot")).toThrow(
      'No Composio auth config mapping for system "hubspot"',
    );
  });

  it("throws when the env var is unset", async () => {
    delete process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(() => getAuthConfigId("zoho")).toThrow("COMPOSIO_ZOHO_AUTH_CONFIG_ID is not set");
  });
});
