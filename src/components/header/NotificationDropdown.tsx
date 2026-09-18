"use client";

import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { apiFetch, type Conversation } from "@/lib/worker-api";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const READ_STORAGE_KEY = "aix.worker.notificationReadIds";

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function channelLabel(channel: string) {
  if (channel === "email") return "Email";
  if (channel === "widget") return "Website";
  return "Chat";
}

function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids]));
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Conversation[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setReadIds(loadReadIds());
    apiFetch<Conversation[]>("/conversations")
      .then((data) => setItems(data.filter((c) => c.status === "needs_human")))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const unreadCount = useMemo(
    () => items.filter((item) => !readIds.has(item.id)).length,
    [items, readIds],
  );

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of items) next.add(item.id);
      persistReadIds(next);
      return next;
    });
  }, [items]);

  const markOneRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistReadIds(next);
      return next;
    });
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="dropdown-toggle relative flex size-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
        )}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        className="mt-2 flex w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden p-0 shadow-theme-lg sm:w-[22rem]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Notifications</h2>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-gray-500 transition-colors hover:text-gray-800 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12.5l4.5 4.5L20 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Mark all read
          </button>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
          {!loaded && (
            <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          )}
          {loaded && items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              You&apos;re caught up — nothing needs review.
            </p>
          )}
          {items.map((conversation, index) => {
            const unread = !readIds.has(conversation.id);
            const subject = conversation.subject?.trim() || "Conversation needs review";
            return (
              <Link
                key={conversation.id}
                href="/inbox"
                onClick={() => {
                  markOneRead(conversation.id);
                  setOpen(false);
                }}
                className={`relative flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04] ${
                  index > 0 ? "border-t border-gray-100 dark:border-gray-800/80" : ""
                } ${unread ? "bg-brand-25/60 dark:bg-brand-500/[0.06]" : ""}`}
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M8 6h11M8 12h11M8 18h7M4 6h.01M4 12h.01M4 18h.01"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 pr-3">
                  <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                    Escalation from {conversation.customerName}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-sm leading-5 text-gray-500 dark:text-gray-400">
                    {subject}. {channelLabel(conversation.channel)} · waiting for a manager.
                  </span>
                  <span className="mt-2 block text-right text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(conversation.updatedAt)}
                  </span>
                </span>
                {unread && (
                  <span
                    className="absolute right-3 top-3 size-2 rounded-full bg-brand-500"
                    aria-label="Unread"
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-gray-200 p-2 dark:border-gray-800">
          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Open inbox
          </Link>
        </div>
      </Dropdown>
    </div>
  );
}
