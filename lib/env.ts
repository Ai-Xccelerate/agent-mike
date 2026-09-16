export const DEFAULT_ORG_ID = "default";
export const DEFAULT_ORG_NAME = "Default Workspace";

export function envList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE || "").toLowerCase() === "true";
}

/**
 * The frontend and this API commonly live on different hosts (split deploy,
 * e.g. behind Railway's proxy) — `req.nextUrl.origin` is this API's own
 * request origin, which can be an internal bind address the browser can
 * never reach, not the page a redirect must send the manager back to.
 * Prefer the configured allowed origin instead.
 */
export function firstAllowedOrigin(): string | null {
  return envList(process.env.CORS_ALLOWED_ORIGINS)[0] ?? null;
}
