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

export type ModelUnavailabilityReason = "demo_mode" | "missing_api_key";

/**
 * Why the model cannot be called. Demo mode wins when both are set — blaming
 * a missing key while DEMO_MODE=true was the original misdiagnosis.
 */
export function modelUnavailabilityReason(): ModelUnavailabilityReason | null {
  if (isDemoMode()) return "demo_mode";
  if (!process.env.OPENAI_API_KEY) return "missing_api_key";
  return null;
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
