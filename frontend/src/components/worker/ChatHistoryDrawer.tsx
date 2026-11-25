"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/worker-api";
import { readRemembered } from "@/lib/remembered-customer";
import { chatMeta, chatsFromResponse, type HistoryChat, type HistoryResponse } from "@/lib/chat-history";

type Props = {
  siteToken: string;
  /** The chat the customer is in now, if it has started: its verified email is the proof, with the device token as backup. */
  conversationId: string | undefined;
  onClose: () => void;
  onOpen: (chat: HistoryChat) => void;
};

/**
 * "Your chats": the customer's earlier chats from the last 30 days, newest first, in a drawer that slides over the
 * chat. Only a customer whose email was checked with a code is offered it (the server decides; this never guesses).
 */
export default function ChatHistoryDrawer({ siteToken, conversationId, onClose, onOpen }: Props) {
  const [chats, setChats] = useState<HistoryChat[] | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<HistoryResponse>("/chat/conversations", {
      method: "POST",
      widgetSiteToken: siteToken,
      body: JSON.stringify({ conversation_id: conversationId, remember_token: readRemembered(siteToken)?.token }),
    })
      .then((response) => {
        if (!cancelled) setChats(chatsFromResponse(response));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [siteToken, conversationId]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="absolute inset-0 z-20"
      onKeyDown={(event) => {
        // Escape closes the drawer, not the whole chat window around it.
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button type="button" aria-label="Close chat history" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-gray-900/40" />
      <aside role="dialog" aria-label="Your chats" className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Your chats</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close chat history"
            title="Close"
            className="flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {failed ? (
            <p className="px-1 py-2 text-sm text-gray-500 dark:text-gray-400">Your chats could not be loaded. Close this and try again.</p>
          ) : chats === null ? (
            <p role="status" className="px-1 py-2 text-sm text-gray-500 dark:text-gray-400">Loading your chats</p>
          ) : chats.length === 0 ? (
            <p className="px-1 py-2 text-sm text-gray-500 dark:text-gray-400">No earlier chats in the last 30 days.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(chat)}
                    aria-current={chat.id === conversationId ? "true" : undefined}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-white/5 ${
                      chat.id === conversationId ? "border-brand-500" : "border-gray-200 dark:border-gray-800"
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{chat.title}</span>
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">{chatMeta(chat)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
