import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ZOHO = process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
const ORIGINAL_LINEAR = process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID;
const ORIGINAL_GMAIL = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
const ORIGINAL_OUTLOOK = process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID;
const ORIGINAL_GOOGLECALENDAR = process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID;
const ORIGINAL_JIRA = process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID;

afterEach(() => {
  if (ORIGINAL_ZOHO === undefined) delete process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_ZOHO_AUTH_CONFIG_ID = ORIGINAL_ZOHO;
  if (ORIGINAL_LINEAR === undefined) delete process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID = ORIGINAL_LINEAR;
  if (ORIGINAL_GMAIL === undefined) delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = ORIGINAL_GMAIL;
  if (ORIGINAL_OUTLOOK === undefined) delete process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID = ORIGINAL_OUTLOOK;
  if (ORIGINAL_GOOGLECALENDAR === undefined) delete process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID = ORIGINAL_GOOGLECALENDAR;
  if (ORIGINAL_JIRA === undefined) delete process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID;
  else process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID = ORIGINAL_JIRA;
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

  it("returns the Outlook auth config id from env", async () => {
    process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID = "ac_test_outlook";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("outlook")).toBe("ac_test_outlook");
  });

  it("returns the Google Calendar auth config id from env", async () => {
    process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID = "ac_test_googlecalendar";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("googlecalendar")).toBe("ac_test_googlecalendar");
  });

  it("returns the Jira auth config id from env", async () => {
    process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID = "ac_test_jira";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("jira")).toBe("ac_test_jira");
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

describe("API-key auth configs", () => {
  const KEYS = ["COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID", "COMPOSIO_CONFLUENCE_API_KEY_AUTH_CONFIG_ID"] as const;
  const saved = KEYS.map((key) => process.env[key]);
  afterEach(() => {
    KEYS.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  });

  it("reads the API-key config separately from the OAuth one", async () => {
    process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID = "ac_oauth_jira";
    process.env.COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID = "ac_key_jira";
    process.env.COMPOSIO_CONFLUENCE_API_KEY_AUTH_CONFIG_ID = "ac_key_confluence";
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(getAuthConfigId("jira")).toBe("ac_oauth_jira");
    expect(getAuthConfigId("jira", "api_key")).toBe("ac_key_jira");
    expect(getAuthConfigId("confluence", "api_key")).toBe("ac_key_confluence");
  });

  it("reads the client-credentials config separately, and says so when it isn't set", async () => {
    const saved = process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID;
    try {
      process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID = "ac_cc_jira";
      vi.resetModules();
      const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
      expect(getAuthConfigId("jira", "client_credentials")).toBe("ac_cc_jira");
      delete process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID;
      expect(() => getAuthConfigId("jira", "client_credentials")).toThrow(
        "COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID is not set",
      );
      expect(() => getAuthConfigId("zoho", "client_credentials")).toThrow("can't connect with OAuth 2.0 client credentials");
    } finally {
      if (saved === undefined) delete process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID;
      else process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID = saved;
    }
  });

  it("lists only the connection methods whose config is set", async () => {
    const names = [
      "COMPOSIO_JIRA_AUTH_CONFIG_ID",
      "COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID",
      "COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID",
    ] as const;
    const saved = names.map((name) => process.env[name]);
    try {
      process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID = "ac_oauth_jira";
      process.env.COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID = "ac_key_jira";
      delete process.env.COMPOSIO_JIRA_CLIENT_CREDENTIALS_AUTH_CONFIG_ID;
      vi.resetModules();
      const { availableAuthMethods } = await import("@/lib/tools-integrations/auth-configs");
      expect(availableAuthMethods("jira")).toEqual(["oauth", "api_key"]);
      delete process.env.COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID;
      expect(availableAuthMethods("jira")).toEqual(["oauth"]);
      expect(availableAuthMethods("zoho")).not.toContain("api_key");
    } finally {
      names.forEach((name, index) => {
        if (saved[index] === undefined) delete process.env[name];
        else process.env[name] = saved[index];
      });
    }
  });

  it("says so when the API-key config isn't set, or the system can't use one", async () => {
    delete process.env.COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID;
    vi.resetModules();
    const { getAuthConfigId } = await import("@/lib/tools-integrations/auth-configs");
    expect(() => getAuthConfigId("jira", "api_key")).toThrow("COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID is not set");
    expect(() => getAuthConfigId("zoho", "api_key")).toThrow("can't connect with an API key");
  });
});

