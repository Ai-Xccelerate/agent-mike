"use client";

import Badge from "@/components/ui/badge/Badge";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { apiFetch, Conversation } from "@/lib/mike-api";
import Link from "next/link";
import { useEffect, useState } from "react";

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [items, setItems] = useState<Conversation[]>([]);

  useEffect(() => {
    apiFetch<Conversation[]>("/conversations?conversation_status=needs_human")
      .then(setItems)
      .catch(() => undefined);
  }, []);

  const unread = items.length > 0 && !seen;

  function toggle() { setOpen((value) => !value); setSeen(true); }

  return (
    <div className="relative">
      <button aria-label={unread ? `Notifications, ${items.length} unread` : "Notifications"} aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="relative flex size-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800">
        {unread && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="absolute right-0 mt-[17px] w-[calc(100vw-2rem)] max-w-[360px] rounded-2xl border border-gray-200 p-3 shadow-theme-lg dark:border-gray-800 sm:w-[360px]">
        <div className="flex items-center justify-between border-b border-gray-100 px-1 pb-3 dark:border-gray-800"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Needs your attention</h2><Badge size="sm" color={items.length ? "warning" : "light"}>{items.length} open</Badge></div>
        <div className="mt-2 space-y-1">
          {!items.length && <p className="px-3 py-8 text-center text-sm text-gray-500">Nothing needs your review right now.</p>}
          {items.map((conversation) => (
            <Link key={conversation.id} href="/inbox" onClick={() => setOpen(false)} className="flex gap-3 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-white/5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-50 text-xs font-semibold text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">{initials(conversation.customer_name)}</span>
              <span className="min-w-0">
                <span className="block text-sm text-gray-700 dark:text-gray-300"><strong>{conversation.customer_name}</strong> — {conversation.subject}. Mike escalated it.</span>
                <span className="mt-1 block text-xs text-gray-500">{relativeTime(conversation.updated_at)} · {conversation.channel === "email" ? "Email" : "Website chat"}</span>
              </span>
            </Link>
          ))}
        </div>
        <Link href="/inbox" onClick={() => setOpen(false)} className="mt-2 block rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5">Open support inbox</Link>
      </Dropdown>
    </div>
  );
}
