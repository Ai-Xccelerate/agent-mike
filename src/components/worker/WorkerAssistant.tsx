"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AssistantHistoryPanel from "@/components/worker/AssistantHistoryPanel";
import Markdown from "@/components/worker/Markdown";
import { ArrowUpIcon, MicrophoneIcon, PlusIcon, TimeIcon } from "@/icons";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { apiFetch, AssistantChatResponse, Conversation, Message, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";
import { FormEvent, useEffect, useRef, useState } from "react";

const MESSAGE_MAX_LENGTH = 4000;

// Short label for the chip button, full sentence actually sent on click -
// same split Jules uses (compact pills, longer prompt underneath). Generic
// across whatever this worker is configured to do: no "ticket", no
// "refund" - this page ships for any AI Worker persona, not just support.
const SUGGESTION_CHIPS = [
  { label: "Open conversations", prompt: "How many conversations are open right now?" },
  { label: "Summarize a conversation", prompt: "Summarize my most recently escalated conversation" },
  { label: "Guardrail rules", prompt: "What does my current guardrail escalate on?" },
  { label: "Search knowledge", prompt: "Search my knowledge base for a topic" },
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

  const { listening, supported: voiceSupported, toggle: toggleVoice, error: voiceError } = useVoiceInput((text) => {
    setValue((prev) => (prev ? `${prev} ` : "") + text);
    inputRef.current?.focus();
  });

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
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-300 px-5 dark:border-white/15">
          <p className="min-w-0 truncate text-sm font-medium text-gray-600 dark:text-gray-400">{conversationTitle ?? ""}</p>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
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
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => void sendText(chip.prompt)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
              {messages.map((message) => {
                const isAgent = message.senderType === "agent";
                return isAgent ? (
                  <div key={message.id} className="flex gap-2.5">
                    <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
                    <div className="max-w-[82%] pt-1 text-sm leading-6 text-gray-700 dark:text-gray-200">
                      <Markdown>{message.body}</Markdown>
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand-500 px-4 py-3 text-right text-sm leading-6 text-white">
                      {message.body}
                    </p>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-center gap-2.5">
                  <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
                  <div className="flex gap-1 px-1 py-3">
                    <span className="size-1.5 animate-pulse rounded-full bg-gray-400" />
                    <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void sendText(value);
          }}
          className="mt-auto shrink-0 px-4 pb-3 sm:px-6 sm:pb-4"
        >
          <div className="glass-surface mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl p-3.5 shadow-lg shadow-gray-900/10 outline outline-2 outline-offset-1 outline-transparent transition-[outline-color] focus-within:outline-brand-500 dark:shadow-black/30">
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
              placeholder={listening ? "Listening. Speak now…" : `Ask ${displayName}'s assistant a question…`}
              className="max-h-32 min-h-9 w-full resize-none bg-transparent px-1 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
            />
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto hidden items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 sm:flex dark:border-gray-700 dark:text-gray-500">
                ↵ to send
              </span>
              <button
                type="button"
                onClick={toggleVoice}
                disabled={!voiceSupported}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={listening}
                title={
                  voiceSupported
                    ? listening
                      ? "Stop voice input"
                      : "Dictate your message"
                    : "Voice input isn't supported in this browser"
                }
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  listening
                    ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05]"
                }`}
              >
                <MicrophoneIcon className="size-4" />
              </button>
              <button
                type="submit"
                disabled={!value.trim() || loading}
                aria-label="Send message"
                title="Send message"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-gray-500 dark:text-gray-400">
            {voiceError ?? "Answers questions about your business today. Configuring settings and taking actions are coming later."}
          </p>
        </form>
      </div>
      <AssistantHistoryPanel
        selectedId={conversationId}
        refreshKey={refreshKey}
        open={historyOpen}
        onSelect={(id) => setConversationId(id)}
        onNew={startNew}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
