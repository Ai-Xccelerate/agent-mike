export const AGENT_SLUG = "mike";

function envName() {
  return (
    process.env.APP_ENV ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    ""
  ).toLowerCase();
}

export function isDeployedEnvironment() {
  const name = envName();
  return (
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    name === "staging" ||
    name === "production"
  );
}

export function localBypassRequested() {
  const raw = (process.env.MIKE_ALLOW_LOCAL_UNAUTH || "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Throws if the local Clerk bypass is enabled outside explicit local development. */
export function assertLocalBypassSafe() {
  if (localBypassRequested() && isDeployedEnvironment()) {
    throw new Error(
      "MIKE_ALLOW_LOCAL_UNAUTH is not allowed in staging or production. Unset it and use Clerk.",
    );
  }
}

export function isLocalUnauthEnabled() {
  assertLocalBypassSafe();
  if (!localBypassRequested()) return false;
  if (process.env.APP_ENV !== "local") return false;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.RAILWAY_ENVIRONMENT) return false;
  return true;
}

export function envList(name: string) {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  return raw
    .split(",")
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}
