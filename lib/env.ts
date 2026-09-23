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
 * Cheaper/faster model for input/output guardrail classifiers. Falls back to
 * the same default as worker profiles until a real model registry (Gap 8).
 */
export function guardrailModel(): string {
  return (process.env.GUARDRAIL_MODEL || "").trim() || "gpt-5.6-luna";
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

/**
 * This deployment's own public frontend origin — for building a redirect/
 * callback URL that must point back at *this app specifically* (OAuth
 * callbacks for Composio and Nylas mailbox connect both need this).
 *
 * Deliberately NOT firstAllowedOrigin(): CORS_ALLOWED_ORIGINS is an
 * unordered allow-list (AIX Core's shell origin is typically listed first,
 * since that's where auth redirects originate) — treating its first entry
 * as "our own canonical origin" sent every OAuth callback here to whatever
 * happened to be listed first, not to this app. Prefers a var meant for
 * exactly this purpose, falls back to the widget's already-correct public
 * origin, and only then to the historical (order-dependent) behavior so a
 * deployment that hasn't set either new var doesn't regress.
 */
export function publicAppUrl(): string | null {
  const explicit = (process.env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const widgetOrigin = (process.env.NEXT_PUBLIC_WIDGET_ORIGIN || "").trim().replace(/\/+$/, "");
  if (widgetOrigin) return widgetOrigin;
  return firstAllowedOrigin();
}
