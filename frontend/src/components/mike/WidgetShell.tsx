"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import { ChatPanel } from "@/components/mike/ChatExperience";
import { useCallback, useEffect, useState } from "react";

/**
 * Embeddable floating launcher: bubble when closed, chat panel when open.
 * Transparent page so host sites show through the iframe.
 */
export default function WidgetShell() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    document.documentElement.dataset.mikeWidget = "1";
    document.body.dataset.mikeWidget = "1";
    return () => {
      delete document.documentElement.dataset.mikeWidget;
      delete document.body.dataset.mikeWidget;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <main
      data-mike-widget="1"
      className="pointer-events-none fixed inset-0 z-[2147483000] overflow-hidden bg-transparent"
    >
      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-end gap-3">
        {open && (
          <div className="flex h-[min(640px,calc(100dvh-5.5rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
            <ChatPanel compact onClose={close} />
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close chat with Mike" : "Chat with Mike"}
          aria-expanded={open}
          className="flex size-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-cta transition-transform hover:scale-105 hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          {open ? (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <span className="relative">
              <AgentAvatar name="Mike" size="md" showStatus />
            </span>
          )}
        </button>
      </div>
    </main>
  );
}
