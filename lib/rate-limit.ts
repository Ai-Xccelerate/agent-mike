/**
 * A sliding-window rate limit, kept in this process's memory.
 *
 * Each key remembers the times of its recent hits and allows a new one only
 * while fewer than `limit` fall inside the window, so a burst can't slip
 * through at a window edge the way it can with fixed windows. Memory is
 * per server instance: with several instances the real limit is the number of
 * instances times `limit`, and a restart clears it. That is enough to stop a
 * script running up cost; use a shared store if a limit must be exact.
 */

const hits = new Map<string, number[]>();
/** A safety bound on distinct keys (one per visitor) so the map can't grow forever. */
const MAX_KEYS = 20000;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) pruneOldest(now, windowMs);
  return { allowed: true };
}

function pruneOldest(now: number, windowMs: number): void {
  for (const [key, times] of hits) {
    if (!times.some((time) => now - time < windowMs)) hits.delete(key);
  }
  // Still over the bound: drop the oldest keys, which were inserted first.
  for (const key of hits.keys()) {
    if (hits.size <= MAX_KEYS) break;
    hits.delete(key);
  }
}

/** For tests. */
export function resetRateLimits(): void {
  hits.clear();
}

/**
 * The caller's address behind the proxy. The first X-Forwarded-For entry is
 * whatever the client sent, so it is not trusted: prefer X-Real-IP, else the
 * last entry (the one our own proxy appended). Per-site limits back this up,
 * so a spoofed address can't dodge the cap on spending.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last || "unknown";
}
