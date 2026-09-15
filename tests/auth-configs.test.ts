import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ZOHO = process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
const ORIGINAL_LINEAR = process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID;
const ORIGINAL_GMAIL = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;

afterEach(() => {
  if (ORIGINAL_ZOHO === undefined) delete process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID = ORIGINAL_ZOHO;
  if (ORIGINAL_LINEAR === undefined) delete process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID = ORIGINAL_LINEAR;
  if (ORIGINAL_GMAIL === undefined) delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = ORIGINAL_GMAIL;
  vi.resetModules();
});

describe("auth config lookup", () => {
  it("returns the Zoho auth config id from env", async () => {
    process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID = "ac_test_zoho";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("zoho")).toBe("ac_test_zoho");
  });

  it("returns the Linear auth config id from env", async () => {
    process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID = "ac_test_linear";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("linear")).toBe("ac_test_linear");
  });

  it("returns the Gmail auth config id from env", async () => {
    process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "ac_test_gmail";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("gmail")).toBe("ac_test_gmail");
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
