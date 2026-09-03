type AuthDebugPayload = Record<string, unknown>;

const PREFIX = "[mike-auth]";

function shouldLog() {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG === "true") return true;
  if (process.env.NEXT_PUBLIC_APP_ENV === "staging") return true;
  return false;
}

export function authDebug(phase: string, payload: AuthDebugPayload = {}) {
  if (!shouldLog()) return;
  console.info(PREFIX, phase, payload);
}

export function authEnvSnapshot() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  return {
    publishableKeyPresent: publishableKey.length > 0,
    publishableKeyLength: publishableKey.length,
    coreApiPresent: Boolean(process.env.NEXT_PUBLIC_CORE_API_URL),
    coreAppPresent: Boolean(process.env.NEXT_PUBLIC_CORE_APP_URL),
    signInUrlPresent: Boolean(process.env.CLERK_SIGN_IN_URL),
    allowedRedirectOriginsCount: (process.env.CLERK_ALLOWED_REDIRECT_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length,
  };
}
