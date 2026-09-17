"use client";

import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
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
 * The Assistant's own conversation history, opened from the top bar as an
 * overlay rather than a permanent rail (per the layout call — Jules' rail
 * became a top-bar "History" affordance instead). Lists channel=assistant
 * only, so it never mixes with Playground's channel=chat test conversations
 * or real customer traffic.
 */
export default function AssistantHistoryPanel({
  selectedId,
  refreshKey,
  onSelect,
  onNew,
  onClose,
}: {
  selectedId: string | null;
  refreshKey: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Conversation[]>("/conversations?channel=assistant")
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
  }, [refreshKey]);

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

  async function remove(id: string) {
    setConversations((items) => items.filter((c) => c.id !== id));
    try {
      await apiFetch(`/conversations/${id}`, { method: "DELETE" });
    } catch {
      /* already removed from view; a stale row would just reappear on next refresh */
    }
    if (id === selectedId) onNew();
  }

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="absolute right-4 top-14 z-[61] flex max-h-[26rem] w-[280px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-200 p-2.5 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
          />
          <button
            type="button"
            onClick={() => {
              onNew();
              onClose();
            }}
            aria-label="New chat"
            title="New chat"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>

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
                    <p className="truncate pr-10 text-xs font-medium text-gray-800 dark:text-white/90">
                      {conversation.subject || "Untitled"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      {relativeTime(conversation.updatedAt)}
                    </p>
                  </button>
                )}
                <div className="absolute right-1.5 top-1.5 hidden items-center gap-0.5 group-hover:flex">
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
                    aria-label="Delete conversation"
                    onClick={() => remove(conversation.id)}
                    className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
                  >
                    <TrashBinIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
