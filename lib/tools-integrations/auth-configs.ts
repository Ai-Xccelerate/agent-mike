const AUTH_CONFIG_ENV: Record<string, string> = {
  zoho: "COMPOSIO_ZOHO_AUTH_CONFIG_ID",
  linear: "COMPOSIO_LINEAR_AUTH_CONFIG_ID",
};

export function getAuthConfigId(system: string): string {
  const envName = AUTH_CONFIG_ENV[system];
  if (!envName) {
    throw new Error(`No Composio auth config mapping for system "${system}"`);
  }
  const value = (process.env[envName] || "").trim();
  if (!value) {
    throw new Error(`${envName} is not set`);
  }
  return value;
}
