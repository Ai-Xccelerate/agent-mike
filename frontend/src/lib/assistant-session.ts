/**
 * Keeps the admin Assistant's open chat across navigation, reloads, and
 * Chrome discarding a background tab. The chat's id lives in the URL
 * (/assistant?c=<id>); this module remembers the last one per signed-in
 * person and workspace, so opening Assistant from the sidebar brings it back
 * for 30 minutes after it was last active; after that, or after "New chat", it opens a fresh one
 * (earlier chats stay in History).
 *
 * Browser storage is a convenience here, never the record: every read is
 * wrapped, and a blocked or empty store just means a fresh chat.
 */

const LAST_PREFIX = "aix:assistant:last:";
const DRAFT_PREFIX = "aix:assistant:draft:";
const PENDING_PREFIX = "aix:assistant:pending:";
const listeners = new Set<() => void>();

export function lastConversationKey(userId: string | null | undefined, orgId: string | null | undefined): string | null {
  return userId ? `${LAST_PREFIX}${orgId ?? "personal"}:${userId}` : null;
}

function read(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(storage: "local" | "session", key: string, value: string | null) {
  try {
    const store = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Private window / blocked storage: the chat still works, it just won't be restored.
  }
}

export function subscribeToLastConversation(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** How long after the last activity the Assistant still reopens the same chat; after that it opens a fresh one. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

function parseLast(raw: string | null): { id: string; at: number } | null {
  if (!raw) return null;
  const [id, at] = raw.split("|");
  const stamp = Number(at);
  return id && Number.isFinite(stamp) ? { id, at: stamp } : null;
}

/** The chat to reopen from the sidebar link: the last one, if it was active within the resume window. */
export function readLastConversation(key: string | null, now: number = Date.now()): string | null {
  const last = key ? parseLast(read("local", key)) : null;
  return last && now - last.at <= RESUME_WINDOW_MS ? last.id : null;
}

/** Remembers the open chat and when it was last active (called again on each message to keep it fresh). */
export function rememberLastConversation(key: string | null, conversationId: string | null, now: number = Date.now()) {
  if (!key) return;
  const current = parseLast(read("local", key));
  if (conversationId === null) {
    if (current === null && read("local", key) === null) return;
    write("local", key, null);
    listeners.forEach((listener) => listener());
    return;
  }
  // Stamp refreshes are quiet (no listeners) and rate-limited; only a different chat notifies.
  if (current?.id === conversationId && now - current.at < 10_000) return;
  write("local", key, `${conversationId}|${now}`);
  if (current?.id !== conversationId) listeners.forEach((listener) => listener());
}

export type ChatDraft = {
  text: string;
  files: { id: string; filename: string; intent: "context" | "knowledge" | "skill" }[];
};

/** Unsent text and attached files, per chat ("new" for one not started yet). Session only. */
export function readDraft(conversationId: string | null): ChatDraft | null {
  const raw = read("session", DRAFT_PREFIX + (conversationId ?? "new"));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChatDraft;
  } catch {
    return null;
  }
}

export function saveDraft(conversationId: string | null, draft: ChatDraft) {
  const key = DRAFT_PREFIX + (conversationId ?? "new");
  write("session", key, draft.text || draft.files.length ? JSON.stringify(draft) : null);
}

/**
 * A chat the browser created and sent but hasn't heard back about yet. If the
 * page reloads before the server has saved it, a "not found" for this id
 * means "not yet", not "gone".
 */
export function markPendingConversation(conversationId: string, pending: boolean) {
  write("session", PENDING_PREFIX + conversationId, pending ? "1" : null);
}

export function isPendingConversation(conversationId: string): boolean {
  return read("session", PENDING_PREFIX + conversationId) === "1";
}
