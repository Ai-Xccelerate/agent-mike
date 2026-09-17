"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AssistantHistoryPanel from "@/components/worker/AssistantHistoryPanel";
import Markdown from "@/components/worker/Markdown";
import { ArrowUpIcon, PlusIcon, TimeIcon } from "@/icons";
import { apiFetch, AssistantChatResponse, Conversation, Message, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";
import { FormEvent, useEffect, useRef, useState } from "react";

const MESSAGE_MAX_LENGTH = 4000;

// Generic across whatever this worker is configured to do - none of these
// assume a support/ticketing domain (no "ticket", no "refund"), since the
// same Assistant page ships for any AI Worker persona.
const SUGGESTION_CHIPS = [
  "How many conversations are open right now?",
  "Summarize my most recently escalated conversation",
  "What does my current guardrail escalate on?",
  "Search my knowledge base for a topic",
];

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function WorkerAssistant() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preview, setPreview] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (next) setProfile(next);
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
  }, []);

  useEffect(() => {
    if (!conversationId) {
      loadedIdRef.current = null;
      setMessages([]);
      setConversationTitle(null);
      return;
    }
    if (loadedIdRef.current === conversationId) return; // already showing it (e.g. just created)
    loadedIdRef.current = conversationId;
    let cancelled = false;
    (async () => {
      try {
        const conversation = await apiFetch<Conversation>(`/conversations/${conversationId}`);
        if (!cancelled) {
          setMessages(conversation.messages ?? []);
          setConversationTitle(conversation.subject ?? null);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const managerName = profile?.managerName ?? "You";
    if (!conversationId && !conversationTitle) setConversationTitle(trimmed.slice(0, 120));
    setMessages((items) => [
      ...items,
      {
        id: `manager-${Date.now()}`,
        conversationId: conversationId ?? "",
        senderType: "manager",
        senderName: managerName,
        body: trimmed,
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    setValue("");
    setLoading(true);
    try {
      const response = await apiFetch<AssistantChatResponse>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, conversation_id: conversationId ?? undefined }),
      });
      loadedIdRef.current = response.conversation_id;
      const isNew = !conversationId;
      setConversationId(response.conversation_id);
      if (isNew) setRefreshKey((k) => k + 1);
      setMessages((items) => [...items, response.message]);
      setPreview(false);
    } catch {
      setPreview(true);
      setMessages((items) => [
        ...items,
        {
          id: `fallback-${Date.now()}`,
          conversationId: conversationId ?? "",
          senderType: "agent",
          senderName: `${profile?.displayName ?? "Your worker"} Assistant`,
          body: "I can't reach the API right now, so I can't answer confidently. Please try again in a moment.",
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function startNew() {
    setConversationId(null);
    setMessages([]);
    setConversationTitle(null);
    setValue("");
    inputRef.current?.focus();
  }

  const displayName = profile?.displayName ?? "your worker";
  const avatarInitials = profile?.avatarInitials ?? "AW";
  const accentColor = profile?.accentColor;
  const avatarUrl = profile?.avatarUrl;
  const managerName = profile?.managerName;
  const isBlank = !conversationId && messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <AssistantHistoryPanel
        selectedId={conversationId}
        refreshKey={refreshKey}
        open={historyOpen}
        onSelect={(id) => setConversationId(id)}
        onNew={startNew}
        onClose={() => setHistoryOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
          <p className="min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-300">{conversationTitle ?? ""}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <TimeIcon className="size-3.5" />
              History
            </button>
            <button
              type="button"
              onClick={startNew}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              <PlusIcon className="size-3.5" />
              New chat
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gray-25 p-4 dark:bg-gray-950/40 sm:p-5">
          {preview && (
            <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
              Couldn&apos;t reach the assistant
            </div>
          )}

          {isBlank && !loading ? (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 text-center">
              <AgentAvatar initials={avatarInitials} size="lg" accentColor={accentColor} avatarUrl={avatarUrl} />
              <p className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {greetingForHour(new Date().getHours())}
                {managerName ? `, ${managerName}` : ""}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ask about your conversations, check your guardrails, or search your knowledge base.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {SUGGESTION_CHIPS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendText(prompt)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isAgent = message.senderType === "agent";
              return (
                <div key={message.id} className={`flex gap-2.5 ${isAgent ? "" : "flex-row-reverse"}`}>
                  {isAgent ? (
                    <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-800">
                      {(managerName ?? "M").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className={`max-w-[82%] ${isAgent ? "" : "text-right"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${
                        isAgent
                          ? "rounded-tl-md border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
                          : "rounded-tr-md bg-brand-500 text-white"
                      }`}
                    >
                      {isAgent ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center gap-2.5">
              <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
              <div className="flex gap-1 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.04]">
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400" />
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void sendText(value);
          }}
          className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-800 sm:p-6"
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-gray-300 bg-white p-2.5 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
            <textarea
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={`Ask ${displayName}'s assistant a question…`}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
            />
            <button
              type="submit"
              disabled={!value.trim() || loading}
              aria-label="Send message"
              title="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-gray-500 dark:text-gray-400">
            Answers questions about your business today. Configuring settings and taking actions are coming later.
          </p>
        </form>
      </div>
    </div>
  );
}
