/**
 * Local read/unread state for Inbox + the notifications bell.
 *
 * Stores conversationId → updatedAt at the moment the manager opened it.
 * A later update (new message / escalation) makes the row unread again.
 *
 * Migrates the older notifications-only format (a flat id array).
 */

export const CONVERSATION_READ_STORAGE_KEY = "aix.worker.conversationReadAt";
const LEGACY_NOTIFICATION_READ_KEY = "aix.worker.notificationReadIds";
export const CONVERSATION_READ_EVENT = "aix.worker.conversationRead";

export type ConversationReadMap = Record<string, string>;

function isIsoString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function migrateLegacyIds(): ConversationReadMap {
  try {
    const raw = window.localStorage.getItem(LEGACY_NOTIFICATION_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return {};
    const now = new Date().toISOString();
    const next: ConversationReadMap = {};
    for (const id of parsed) {
      if (typeof id === "string" && id) next[id] = now;
    }
    return next;
  } catch {
    return {};
  }
}

export function loadConversationReadMap(): ConversationReadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONVERSATION_READ_STORAGE_KEY);
    if (!raw) {
      const migrated = migrateLegacyIds();
      if (Object.keys(migrated).length) persistConversationReadMap(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: ConversationReadMap = {};
    for (const [id, stamp] of Object.entries(parsed as Record<string, unknown>)) {
      if (id && isIsoString(stamp)) next[id] = stamp;
    }
    return next;
  } catch {
    return {};
  }
}

export function persistConversationReadMap(map: ConversationReadMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONVERSATION_READ_STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CONVERSATION_READ_EVENT));
}

export function isConversationUnread(
  conversation: { id: string; updatedAt: string },
  readMap: ConversationReadMap,
): boolean {
  const lastReadAt = readMap[conversation.id];
  if (!lastReadAt) return true;
  return new Date(conversation.updatedAt).getTime() > new Date(lastReadAt).getTime();
}

export function markConversationRead(
  conversation: { id: string; updatedAt: string },
  prev: ConversationReadMap,
): ConversationReadMap {
  if (prev[conversation.id] === conversation.updatedAt) return prev;
  const next = { ...prev, [conversation.id]: conversation.updatedAt };
  persistConversationReadMap(next);
  return next;
}

export function markConversationsRead(
  conversations: { id: string; updatedAt: string }[],
  prev: ConversationReadMap,
): ConversationReadMap {
  let changed = false;
  const next = { ...prev };
  for (const conversation of conversations) {
    if (next[conversation.id] === conversation.updatedAt) continue;
    next[conversation.id] = conversation.updatedAt;
    changed = true;
  }
  if (!changed) return prev;
  persistConversationReadMap(next);
  return next;
}
