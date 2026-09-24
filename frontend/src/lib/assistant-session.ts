/**
 * Keeps the admin Assistant's open chat across navigation, reloads, and
 * Chrome discarding a background tab. The chat's id lives in the URL
 * (/assistant?c=<id>); this module remembers the last one per signed-in
 * person and workspace, so opening Assistant from the sidebar brings it back
 * until they explicitly start a new chat.
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

export function readLastConversation(key: string | null): string | null {
  return key ? read("local", key) : null;
}

export function rememberLastConversation(key: string | null, conversationId: string | null) {
  if (!key) return;
  if (read("local", key) === conversationId) return;
  write("local", key, conversationId);
  listeners.forEach((listener) => listener());
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
