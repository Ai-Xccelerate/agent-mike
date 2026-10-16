/**
 * A short memory of what a question found in the knowledge base, per org.
 *
 * Retrieval reads the org's own knowledge and any connected source (Confluence
 * through a live search, about a second a turn), and the same question is asked
 * again and again by different customers. What it finds is org-level material,
 * never anything about the customer, so it can be shared between conversations.
 * Short on purpose: an edit in Confluence shows up within the TTL, and an edit
 * made in Mike clears the org's entries at once.
 *
 * RETRIEVAL_CACHE_TTL_MS=0 turns it off.
 */

const DEFAULT_TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 500;

type Entry<T> = { at: number; value: T };
const entries = new Map<string, Entry<unknown>>();

function ttlMs(): number {
  const raw = process.env.RETRIEVAL_CACHE_TTL_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

/** Same question, however it is capitalised, punctuated or spaced. */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function retrievalCacheKey(organizationId: string, settings: unknown, limit: number, query: string): string {
  // Which sources are on is part of the question: switching Confluence off must not serve its old hits.
  return [organizationId, limit, JSON.stringify(settings ?? null), normalizeQuery(query)].join("\u0001");
}

export function readRetrievalCache<T>(key: string): T | undefined {
  const ttl = ttlMs();
  if (ttl === 0) return undefined;
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= ttl) {
    entries.delete(key);
    return undefined;
  }
  // Most recently used last, so the oldest is what makes room.
  entries.delete(key);
  entries.set(key, entry);
  return entry.value as T;
}

export function writeRetrievalCache<T>(key: string, value: T): void {
  if (ttlMs() === 0) return;
  entries.delete(key);
  entries.set(key, { at: Date.now(), value });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** The org's knowledge changed (or, with no org, a test starting clean). */
export function clearRetrievalCache(organizationId?: string): void {
  if (!organizationId) {
    entries.clear();
    return;
  }
  const prefix = `${organizationId}\u0001`;
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
}
