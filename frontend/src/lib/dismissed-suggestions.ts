/**
 * Which suggested replies a manager has dismissed, so coming back to a conversation does not write the same draft
 * again. A draft belongs to one conversation and its newest message, so a new customer message is a new draft that is
 * written (or offered) as usual. Kept in the browser's storage so it survives leaving the page, and in memory so it
 * still works where storage is blocked.
 */

const STORAGE_KEY = "worker.suggestedReply.dismissed.v1";
const MAX_REMEMBERED = 300;

export type DismissedStorage = Pick<Storage, "getItem" | "setItem">;

const inMemory = new Set<string>();

function browserStorage(): DismissedStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function stored(storage: DismissedStorage | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function save(storage: DismissedStorage | null, keys: string[]): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_REMEMBERED)));
  } catch {
    // Blocked or full: the in-memory copy still holds for this visit.
  }
}

export function isDismissed(key: string, storage: DismissedStorage | null = browserStorage()): boolean {
  return inMemory.has(key) || stored(storage).includes(key);
}

export function markDismissed(key: string, storage: DismissedStorage | null = browserStorage()): void {
  inMemory.add(key);
  const keys = stored(storage).filter((entry) => entry !== key);
  save(storage, [...keys, key]);
}

/** A manager who asks for a draft again (Suggest or Rewrite) wants one: the dismissal no longer applies. */
export function clearDismissed(key: string, storage: DismissedStorage | null = browserStorage()): void {
  inMemory.delete(key);
  save(storage, stored(storage).filter((entry) => entry !== key));
}

/** Test hook: forget everything held in memory. */
export function resetDismissedMemory(): void {
  inMemory.clear();
}
