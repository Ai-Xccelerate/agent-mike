"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import {
  BoltIcon,
  BoxIcon,
  CalenderIcon,
  DollarLineIcon,
  GridIcon,
  ListIcon,
  PlugInIcon,
  TaskIcon,
  UserCircleIcon,
} from "@/icons";

interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  icon: React.ReactNode;
  hint?: string;
  run: () => void;
}

/** Global ⌘K command palette — fuzzy navigation + quick actions. */
export default function CommandPalette() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      setOpen(false);
    };
    const nav = (
      icon: React.ReactNode,
      group: string,
      items: { label: string; path: string; keywords?: string }[]
    ) =>
      items.map((it) => ({
        id: group + ":" + it.path,
        label: it.label,
        group,
        keywords: it.keywords,
        icon,
        run: go(it.path),
      }));

    return [
      ...nav(<GridIcon />, "Dashboards", [
        { label: "Ecommerce overview", path: "/", keywords: "home revenue orders" },
        { label: "Workforce", path: "/workforce", keywords: "agents team" },
        { label: "Demand Gen — Nick", path: "/demand-gen", keywords: "nick leads" },
        { label: "Outbound — Jules", path: "/outbound", keywords: "jules sequences" },
        { label: "Inbound — Pepper", path: "/inbound", keywords: "pepper routing" },
        { label: "Technical — Tony", path: "/technical", keywords: "tony escalations" },
        { label: "Deal Ops — Joy", path: "/deal-ops", keywords: "joy pipeline" },
        { label: "Retention — George", path: "/retention", keywords: "george renewals churn" },
        { label: "Revenue", path: "/revenue" },
        { label: "Client Account", path: "/client-account" },
      ]),
      ...nav(<TaskIcon />, "Workspace", [
        { label: "AI Assistant", path: "/assistant", keywords: "chat ask" },
        { label: "Inbox", path: "/inbox", keywords: "email messages" },
        { label: "Calendar", path: "/calendar", keywords: "events schedule" },
        { label: "Tasks", path: "/task-list", keywords: "todo" },
        { label: "Task board", path: "/kanban", keywords: "kanban board" },
        { label: "Transcripts", path: "/transcripts", keywords: "calls" },
        { label: "Chat", path: "/chat", keywords: "messages" },
        { label: "File manager", path: "/file-manager", keywords: "files documents" },
      ]),
      ...nav(<BoltIcon />, "AI Tools", [
        { label: "Text generator", path: "/text-generator" },
        { label: "Image generator", path: "/image-generator" },
        { label: "Code generator", path: "/code-generator" },
        { label: "Video generator", path: "/video-generator" },
        { label: "AI settings", path: "/ai-settings", keywords: "configuration" },
      ]),
      ...nav(<DollarLineIcon />, "Commerce", [
        { label: "Products", path: "/products" },
        { label: "Invoices", path: "/invoices" },
        { label: "Transactions", path: "/transactions" },
        { label: "Billing", path: "/billing" },
      ]),
      ...nav(<UserCircleIcon />, "Account", [
        { label: "User profile", path: "/profile" },
        { label: "Integrations", path: "/integrations", keywords: "connect apps" },
        { label: "API keys", path: "/api-keys", keywords: "developer tokens" },
        { label: "Pricing", path: "/pricing-tables", keywords: "plans" },
      ]),
      {
        id: "action:new-event",
        label: "New event",
        group: "Actions",
        keywords: "calendar create meeting",
        icon: <CalenderIcon />,
        run: () => {
          router.push("/calendar");
          setOpen(false);
        },
      },
      {
        id: "action:add-product",
        label: "Add product",
        group: "Actions",
        keywords: "create new catalog",
        icon: <BoxIcon />,
        run: () => {
          router.push("/add-product");
          setOpen(false);
        },
      },
      {
        id: "action:create-invoice",
        label: "Create invoice",
        group: "Actions",
        keywords: "new billing",
        icon: <ListIcon />,
        run: () => {
          router.push("/create-invoice");
          setOpen(false);
        },
      },
      {
        id: "action:integrations",
        label: "Connect an integration",
        group: "Actions",
        keywords: "salesforce hubspot slack",
        icon: <PlugInIcon />,
        run: () => {
          router.push("/integrations");
          setOpen(false);
        },
      },
      {
        id: "action:toggle-theme",
        label: "Toggle light / dark theme",
        group: "Actions",
        keywords: "dark mode appearance",
        icon: <BoltIcon />,
        run: () => {
          toggleTheme();
          setOpen(false);
        },
      },
    ];
  }, [router, toggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.keywords ?? "").toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Group the flat results while keeping a stable flat index for keyboard nav.
  const grouped = useMemo(() => {
    const map = new Map<string, { cmd: Command; index: number }[]>();
    results.forEach((cmd, index) => {
      const arr = map.get(cmd.group) ?? [];
      arr.push({ cmd, index });
      map.set(cmd.group, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  // Open on ⌘K / Ctrl+K anywhere; also from the header keycap via a custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("aix:open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("aix:open-command-palette", onOpen);
    };
  }, []);

  // Reset + focus on open; lock body scroll.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the active row in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${active}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        results.length ? (i - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="glass-popover relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 shadow-theme-lg dark:border-gray-800"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800">
          <svg
            className="size-5 shrink-0 text-gray-400"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 16.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM17.5 17.5 14 14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="h-14 w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90"
          />
          <kbd className="hidden shrink-0 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-theme-xs text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400 sm:inline-block">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          className="max-h-[52vh] overflow-y-auto overscroll-contain p-2"
        >
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No results for “{query}”
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-theme-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {group}
                </p>
                {items.map(({ cmd, index }) => {
                  const isActive = index === active;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmd-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => cmd.run()}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-100 ${
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center [&>svg]:size-4.5 ${
                          isActive
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {cmd.icon}
                      </span>
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {isActive && (
                        <kbd className="shrink-0 rounded-md border border-brand-200 bg-white/60 px-1.5 py-0.5 text-theme-xs font-medium text-brand-600 dark:border-brand-500/30 dark:bg-transparent dark:text-brand-400">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2.5 text-theme-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-gray-200 px-1 dark:border-gray-700">↑</kbd>
            <kbd className="rounded border border-gray-200 px-1 dark:border-gray-700">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-gray-200 px-1 dark:border-gray-700">↵</kbd>
            to select
          </span>
          <span className="ml-auto hidden items-center gap-1 sm:flex">
            <kbd className="rounded border border-gray-200 px-1 dark:border-gray-700">⌘</kbd>
            <kbd className="rounded border border-gray-200 px-1 dark:border-gray-700">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
