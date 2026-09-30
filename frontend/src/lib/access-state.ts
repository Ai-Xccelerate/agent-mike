/**
 * App-wide "this person can't use Mike" signal. Any console API call can be
 * the one that finds out (AIX Core says no, or Core can't be reached to
 * check), and when it does the whole console is replaced by the no-access
 * screen instead of every panel failing on its own.
 */
export type AccessProblem =
  | { kind: "no_access"; reason: string | null }
  | { kind: "unavailable" };

let problem: AccessProblem | null = null;
const listeners = new Set<() => void>();

export function reportAccessProblem(next: AccessProblem) {
  // The first answer wins: one screen, not a flicker between reasons.
  if (problem) return;
  problem = next;
  listeners.forEach((listener) => listener());
}

/** For the gate's useSyncExternalStore; plain functions so this module stays server-safe. */
export function subscribeAccessProblem(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentAccessProblem(): AccessProblem | null {
  return problem;
}

/**
 * Reads a failed console response. The backend answers a Core "no" with
 * 403 `{ detail: { error: "no_agent_access", reason } }` (lib/clerk-core-auth.ts),
 * and a Core outage or missing catalog entry with 503 (it fails closed).
 */
export function accessProblemFrom(status: number, body: unknown): AccessProblem | null {
  const parsed = (body && typeof body === "object" ? body : {}) as {
    error?: unknown;
    detail?: { error?: unknown; reason?: unknown };
  };
  if (status === 403 && parsed.detail?.error === "no_agent_access") {
    return { kind: "no_access", reason: typeof parsed.detail.reason === "string" ? parsed.detail.reason : null };
  }
  if (status === 503 && typeof parsed.error === "string" && /AIX Core|catalog/i.test(parsed.error)) {
    return { kind: "unavailable" };
  }
  return null;
}
