/** Server-only local Clerk bypass. Fail closed in staging/production/Railway. */

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
  return Boolean(process.env.RAILWAY_ENVIRONMENT) || name === "staging" || name === "production";
}

export function localBypassRequested() {
  const raw = (process.env.MIKE_ALLOW_LOCAL_UNAUTH || "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

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
