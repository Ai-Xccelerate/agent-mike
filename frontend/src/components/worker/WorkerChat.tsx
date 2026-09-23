"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Markdown from "@/components/worker/Markdown";
import WorkerChatRail from "@/components/worker/WorkerChatRail";
import Badge from "@/components/ui/badge/Badge";
import { ArrowUpIcon, DocsIcon, MicrophoneIcon } from "@/icons";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { apiFetch, ChatResponse, Conversation, Message, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";
import { FormEvent, useEffect, useRef, useState } from "react";

const SAMPLE_PROMPTS = [
  "My sign-in code never arrived",
  "How do I invite a teammate?",
  "I need a refund for my last charge",
];

const MESSAGE_MAX_LENGTH = 4000;

function storageKey(compact: boolean) {
  return compact ? "worker.widget.chat.v1" : "worker.manager.chat.v1";
}

type StoredChat = {
  conversationId?: string;
  messages: Message[];
  escalated?: boolean;
};

function welcomeMessage(profile: WorkerProfile | null): Message {
  return {
    id: "welcome",
    conversationId: "",
    senderType: "agent",
    senderName: profile?.displayName ?? "AI Worker",
    body: `Hi! I'm ${profile?.displayName ?? "your AI worker"}. ${profile?.role ?? "How can I help?"}`,
    citations: [],
    createdAt: new Date().toISOString(),
  };
}

export function ChatPanel({
  compact = false,
  onClose,
  siteToken,
  conversationId: externalConversationId = null,
  onConversationCreated,
  onConversationChanged,
  onToggleRail,
}: {
  compact?: boolean;
  onClose?: () => void;
  /** Required for public widget embeds — org is resolved from this token. */
  siteToken?: string;
  /** Manager mode only: which test conversation the rail has selected. null = new/untitled. */
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onConversationChanged?: () => void;
  onToggleRail?: () => void;
}) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [compactConversationId, setCompactConversationId] = useState<string>();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [preview, setPreview] = useState(false);
  const [restoring, setRestoring] = useState(compact);
  const [identityReady, setIdentityReady] = useState(!compact);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);

  const { listening, supported: voiceSupported, toggle: toggleVoice, error: voiceError } = useVoiceInput((text) => {
    setValue((prev) => (prev ? `${prev} ` : "") + text);
    inputRef.current?.focus();
  });

  const conversationId = compact ? compactConversationId : (externalConversationId ?? undefined);

  // Widget and Playground both show this worker's Identity. The widget
  // resolves the org from the site token; the manager console uses the
  // default tenant. A missing profile is what made embeds say "AI Worker".
  useEffect(() => {
    if (compact && !siteToken?.trim()) return;
    let cancelled = false;
    apiFetch<WorkerProfile>("/worker", compact ? { widgetSiteToken: siteToken } : undefined)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIdentityReady(true);
      });
    if (compact) {
      return () => {
        cancelled = true;
      };
    }
    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (next) setProfile(next);
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => {
      cancelled = true;
      window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
    };
  }, [compact, siteToken]);

  // Compact (public widget): a single ongoing conversation restored from
  // sessionStorage, after Identity has loaded so the greeting uses the
  // saved name instead of the "AI Worker" placeholder.
  useEffect(() => {
    if (!compact || !identityReady) return;
    let cancelled = false;
    async function restore() {
      try {
        const raw = sessionStorage.getItem(storageKey(true));
        if (!raw) {
          setMessages([welcomeMessage(profile)]);
          return;
        }
        const stored = JSON.parse(raw) as StoredChat;
        const onlyWelcome = stored.messages?.length === 1 && stored.messages[0]?.id === "welcome";
        setCompactConversationId(stored.conversationId);
        setMessages(
          onlyWelcome || !stored.messages?.length ? [welcomeMessage(profile)] : stored.messages,
        );
        setEscalated(Boolean(stored.escalated));
      } catch {
        sessionStorage.removeItem(storageKey(true));
        setMessages([welcomeMessage(profile)]);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, identityReady]);

  useEffect(() => {
    if (!compact || restoring) return;
    sessionStorage.setItem(
      storageKey(true),
      JSON.stringify({ conversationId: compactConversationId, messages, escalated } satisfies StoredChat),
    );
  }, [compact, compactConversationId, messages, escalated, restoring]);

  // Manager mode: the rail owns which conversation is selected. Load its
  // transcript when the selection changes; reset to a blank slate when
  // nothing is selected (a "New" conversation, not yet sent).
  useEffect(() => {
    if (compact) return;
    if (!externalConversationId) {
      loadedIdRef.current = null;
      setMessages([welcomeMessage(profile)]);
      setEscalated(false);
      setPreview(false);
      return;
    }
    if (loadedIdRef.current === externalConversationId) return; // already showing it (e.g. just created)
    loadedIdRef.current = externalConversationId;
    let cancelled = false;
    (async () => {
      try {
        const conversation = await apiFetch<Conversation>(`/conversations/${externalConversationId}`);
        if (cancelled) return;
        setEscalated(conversation.status === "needs_human");
        setMessages(conversation.messages?.length ? conversation.messages : [welcomeMessage(profile)]);
      } catch {
        if (!cancelled) setMessages([welcomeMessage(profile)]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compact, externalConversationId, profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((items) => [
      ...items,
      {
        id: `customer-${Date.now()}`,
        conversationId: conversationId ?? "",
        senderType: "customer",
        senderName: "You",
        body: trimmed,
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    setValue("");
    setLoading(true);
    try {
      const response = await apiFetch<ChatResponse>("/chat", {
        method: "POST",
        widgetSiteToken: compact ? siteToken : undefined,
        body: JSON.stringify({ message: trimmed, conversation_id: conversationId }),
      });
      if (compact) {
        setCompactConversationId(response.conversation_id);
      } else {
        loadedIdRef.current = response.conversation_id;
        if (!externalConversationId) onConversationCreated?.(response.conversation_id);
        onConversationChanged?.();
      }
      if (response.message) {
        setMessages((items) => [...items, response.message as Message]);
      }
      setEscalated(response.escalated);
      setPreview(false);
    } catch {
      setPreview(true);
      setMessages((items) => [
        ...items,
        {
          id: `fallback-${Date.now()}`,
          conversationId: conversationId ?? "",
          senderType: "agent",
          senderName: profile?.displayName ?? "AI Worker",
          body: "I can't reach the API right now, so I can't answer confidently. Please try again in a moment.",
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setEscalated(true);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const displayName = profile?.displayName ?? "AI Worker";
  const avatarInitials = profile?.avatarInitials ?? "AW";
  const accentColor = profile?.accentColor;
  const avatarUrl = profile?.avatarUrl;
  const isBlank = !compact && !externalConversationId && messages.length <= 1;
  const visibleMessages = messages.map((message) =>
    message.id === "welcome" ? welcomeMessage(profile) : message,
  );

  if (compact && !siteToken?.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-2xl bg-white p-6 text-center dark:bg-gray-900">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Widget not configured</p>
        <p className="max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400">
          Open Chat in the console and use Copy embed snippet. The link must include your org&apos;s site token.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-900 ${compact ? "rounded-2xl" : ""}`}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          {onToggleRail && (
            <button
              type="button"
              onClick={onToggleRail}
              aria-label="Show conversation list"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 lg:hidden"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <AgentAvatar
            initials={avatarInitials}
            size="md"
            showStatus
            status={profile?.status}
            accentColor={accentColor}
            avatarUrl={avatarUrl}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{displayName}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">Online</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {escalated && (
            <Badge size="sm" color="warning">
              Manager notified
            </Badge>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              title="Close chat"
              className="flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gray-25 p-4 [scrollbar-gutter:stable] dark:bg-gray-950/40 sm:p-5">
        {preview && (
          <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
            Preview response · API unreachable
          </div>
        )}
        {visibleMessages.map((message) => {
          const isAgent = message.senderType === "agent";
          return (
            <div key={message.id} className={`flex gap-2.5 ${isAgent ? "" : "flex-row-reverse"}`}>
              {isAgent ? (
                <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-800">
                  Y
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
                {message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.citations.map((citation, index) => {
                      const label = typeof citation === "string" ? citation : (citation as { title?: string })?.title ?? "Source";
                      return (
                      <span
                        key={`${message.id}-${index}-${label}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-light-50 px-2 py-1 text-[11px] font-medium text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-300"
                      >
                        <DocsIcon className="size-3" />
                        {label}
                      </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isBlank && !loading && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-2 text-center">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Try the customer experience</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Live identity, guardrails, and knowledge.</p>
            <div className="mt-1 flex w-full flex-col gap-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendText(prompt)}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left text-xs text-gray-600 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
                >
                  &quot;{prompt}&quot;
                </button>
              ))}
            </div>
          </div>
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
        className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4"
      >
        <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
          <AutoGrowTextarea
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            minRows={1}
            maxRows={6}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={listening ? "Listening. Speak now…" : `Ask ${displayName} a question…`}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
          />
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
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            <ArrowUpIcon className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          <p>{voiceError ?? `${displayName} can make mistakes. Sensitive requests go to a human.`}</p>
          {value.length > MESSAGE_MAX_LENGTH * 0.9 && (
            <span className="shrink-0 tabular-nums">
              {value.length}/{MESSAGE_MAX_LENGTH}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

export default function WorkerChat() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <WorkerChatRail
        selectedId={selectedId}
        refreshKey={refreshKey}
        open={railOpen}
        onClose={() => setRailOpen(false)}
        onSelect={setSelectedId}
        onNew={() => setSelectedId(null)}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <ChatPanel
          conversationId={selectedId}
          onConversationCreated={setSelectedId}
          onConversationChanged={() => setRefreshKey((k) => k + 1)}
          onToggleRail={() => setRailOpen(true)}
        />
      </div>
    </div>
  );
}
