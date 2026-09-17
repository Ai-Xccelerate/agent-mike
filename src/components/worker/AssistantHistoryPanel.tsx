"use client";

import { BoxIcon, PencilIcon, PlusIcon } from "@/icons";
import { apiFetch, Conversation } from "@/lib/worker-api";
import { useEffect, useMemo, useState } from "react";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * The Assistant's own conversation history: a permanent collapsible rail on
 * desktop, and the same content as a full overlay drawer below `lg` - one
 * `open` state drives both, since only one of the two ever renders at a
 * given width. Lists channel=assistant only, so it never mixes with
 * Playground's channel=chat test conversations or real customer traffic.
 *
 * Archive replaces hard delete: a trashed conversation is hidden (not
 * gone), and "Show archived" brings it back into view with a Restore action.
 */
export default function AssistantHistoryPanel({
  selectedId,
  refreshKey,
  open,
  onSelect,
  onNew,
  onClose,
}: {
  selectedId: string | null;
  refreshKey: number;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Conversation[]>(`/conversations?channel=assistant${showArchived ? "&includeArchived=true" : ""}`)
      .then((data) => {
        if (!cancelled) setConversations(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, showArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.subject ?? "untitled").toLowerCase().includes(q));
  }, [conversations, query]);

  async function commitRename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    setConversations((items) => items.map((c) => (c.id === id ? { ...c, subject: title } : c)));
    try {
      await apiFetch<Conversation>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: title }),
      });
    } catch {
      /* left renamed optimistically; the next list refresh reconciles it */
    }
  }

  async function setArchived(id: string, archived: boolean) {
    setConversations((items) =>
      archived && !showArchived ? items.filter((c) => c.id !== id) : items.map((c) => (c.id === id ? { ...c, archived } : c)),
    );
    try {
      await apiFetch<Conversation>(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
    } catch {
      /* already updated optimistically; the next list refresh reconciles it */
    }
    if (archived && id === selectedId) onNew();
  }

  const listContent = (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-200 p-2.5 dark:border-gray-800">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search history"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
        />
        <button
          type="button"
          onClick={onNew}
          aria-label="New chat"
          title="New chat"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      <label className="flex items-center gap-1.5 border-b border-gray-200 px-2.5 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="size-3 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
        />
        Show archived
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {loading && (
          <div className="space-y-2 p-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs leading-5 text-gray-500">
            {conversations.length === 0 ? "No conversations with your assistant yet." : "No matches."}
          </p>
        )}
        {filtered.map((conversation) => {
          const active = conversation.id === selectedId;
          return (
            <div
              key={conversation.id}
              className={`group relative mb-0.5 rounded-lg px-2.5 py-2 ${
                active ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/5"
              }`}
            >
              {renamingId === conversation.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(conversation.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-full rounded border border-brand-300 bg-white px-1.5 py-0.5 text-xs text-gray-800 outline-none dark:bg-gray-900 dark:text-white"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(conversation.id);
                    onClose();
                  }}
                  className="block w-full text-left"
                >
                  <p className="truncate pr-14 text-xs font-medium text-gray-800 dark:text-white/90">
                    {conversation.subject || "Untitled"}
                    {conversation.archived && (
                      <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
                        Archived
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {relativeTime(conversation.updatedAt)}
                  </p>
                </button>
              )}
              <div className="absolute right-1.5 top-1.5 hidden items-center gap-0.5 group-hover:flex">
                {conversation.archived ? (
                  <button
                    type="button"
                    onClick={() => setArchived(conversation.id, false)}
                    className="rounded px-1.5 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10"
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label="Rename conversation"
                      onClick={() => {
                        setRenamingId(conversation.id);
                        setRenameValue(conversation.subject ?? "");
                      }}
                      className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10"
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Archive conversation"
                      title="Archive"
                      onClick={() => setArchived(conversation.id, true)}
                      className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10"
                    >
                      <BoxIcon className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div className={open ? "hidden h-full w-[260px] shrink-0 border-r border-gray-200 lg:flex dark:border-gray-800" : "hidden"}>
        {listContent}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] flex lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <div className="relative h-full w-[280px] shadow-xl">{listContent}</div>
        </div>
      )}
    </>
  );
}
