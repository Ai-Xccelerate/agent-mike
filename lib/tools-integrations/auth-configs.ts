const AUTH_CONFIG_ENV: Record<string, string> = {
  zoho: "COMPOSIO_ZOHO_AUTH_CONFIG_ID",
  linear: "COMPOSIO_LINEAR_AUTH_CONFIG_ID",
  gmail: "COMPOSIO_GMAIL_AUTH_CONFIG_ID",
  outlook: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
  googlecalendar: "COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID",
  jira: "COMPOSIO_JIRA_AUTH_CONFIG_ID",
  confluence: "COMPOSIO_CONFLUENCE_AUTH_CONFIG_ID",
};

/**
 * A second sign-in for systems that can connect with an API token instead of
 * a person's OAuth sign-in (e.g. an Atlassian service account, which has no
 * login to sign in with). It is a separate Composio auth config, so setting
 * it never changes how the OAuth connections already made keep working.
 */
const API_KEY_AUTH_CONFIG_ENV: Record<string, string> = {
  jira: "COMPOSIO_JIRA_API_KEY_AUTH_CONFIG_ID",
  confluence: "COMPOSIO_CONFLUENCE_API_KEY_AUTH_CONFIG_ID",
};

export type AuthMethod = "oauth" | "api_key";

export function getAuthConfigId(system: string, method: AuthMethod = "oauth"): string {
  const envName = (method === "api_key" ? API_KEY_AUTH_CONFIG_ENV : AUTH_CONFIG_ENV)[system];
  if (!envName) {
    throw new Error(
      method === "api_key"
        ? `${system} can't connect with an API key`
        : `No Composio auth config mapping for system "${system}"`,
    );
  }
  const value = (process.env[envName] || "").trim();
  if (!value) {
    throw new Error(`${envName} is not set`);
  }
  return value;
}
