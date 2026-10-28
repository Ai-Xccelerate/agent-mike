"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Markdown from "@/components/worker/Markdown";
import WorkerChatRail from "@/components/worker/WorkerChatRail";
import Badge from "@/components/ui/badge/Badge";
import { ArrowUpIcon, DocsIcon, MicrophoneIcon } from "@/icons";
import { useDictation } from "@/hooks/useDictation";
import { apiFetch, ChatResponse, Conversation, Message, WorkerApiError, WorkerProfile } from "@/lib/worker-api";
import { attachedLines, FILE_ACCEPT, FILE_MAX_BYTES, FILES_MAX, fileSize } from "@/lib/customer-files";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";
import { forgetRemembered, readRemembered } from "@/lib/remembered-customer";
import { quickActionsFor, welcomeText } from "@/lib/widget-defaults";
import { mergeWidgetHistory, sameMessages } from "@/lib/widget-history";
import { cardToolCall, isCustomerCard } from "@/lib/customer-cards";
import CustomerCopilot, { CUSTOMER_CHAT_AGENT_ID } from "@/components/worker/customer-cards/CustomerCopilot";
import { CustomerCardsContext, LatestReplyContext, type ChatIdentity } from "@/components/worker/customer-cards/CustomerCards";
import { useAgent, useRenderToolCall } from "@copilotkit/react-core/v2";
import { FormEvent, useEffect, useRef, useState } from "react";

const MESSAGE_MAX_LENGTH = 4000;
/** How often the open website chat asks the server for new messages (a manager's reply). */
const WIDGET_SYNC_MS = 5000;

// Scoped by site token, not a fixed string: the widget is served from one
// shared origin regardless of which org embeds it, so a fixed key would let
// one org's cached conversation flash into another's view if the same tab
// is reused across site tokens (e.g. previewing multiple embeds in a row).
function storageKey(siteToken: string | undefined) {
  return `worker.widget.chat.v1.${(siteToken || "").trim()}`;
}

type StoredChat = {
  conversationId?: string;
  messages: Message[];
  escalated?: boolean;
  /** What the visitor told the chat about themselves, so a reload does not ask again. */
  identity?: ChatIdentity;
};

function welcomeMessage(profile: WorkerProfile | null): Message {
  return {
    id: "welcome",
    conversationId: "",
    senderType: "agent",
    senderName: profile?.displayName ?? "AI Worker",
    // Not the Role: that's an instruction written for the worker, and read
    // out to a customer it sounded like a job description.
    body: welcomeText(profile?.welcomeMessage, profile?.displayName ?? "your AI worker"),
    citations: [],
    createdAt: new Date().toISOString(),
  };
}

type ChatPanelProps = {
  compact?: boolean;
  onClose?: () => void;
  /** Required for public widget embeds — org is resolved from this token. */
  siteToken?: string;
  /** Manager mode only: which test conversation the rail has selected. null = new/untitled. */
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onConversationChanged?: () => void;
  onToggleRail?: () => void;
};

/**
 * The customer chat, for the website widget (compact) and the Playground.
 * Replies come over AG-UI through CopilotKit, which renders their cards
 * (quick replies, the ticket) under the text.
 */
export function ChatPanel(props: ChatPanelProps) {
  return (
    <CustomerCopilot siteToken={props.compact ? props.siteToken : undefined}>
      <ChatPanelBody {...props} />
    </CustomerCopilot>
  );
}

function ChatPanelBody({
  compact = false,
  onClose,
  siteToken,
  conversationId: externalConversationId = null,
  onConversationCreated,
  onConversationChanged,
  onToggleRail,
}: ChatPanelProps) {
  const { agent } = useAgent({ agentId: CUSTOMER_CHAT_AGENT_ID });
  const renderToolCall = useRenderToolCall();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [compactConversationId, setCompactConversationId] = useState<string>();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [preview, setPreview] = useState(false);
  const [restoring, setRestoring] = useState(compact);
  const [identityReady, setIdentityReady] = useState(!compact);
  const [storedIdentity, setIdentity] = useState<ChatIdentity | undefined>(undefined);
  // Playground: what one test conversation's visitor said is not true of the next.
  const [identityConversationId, setIdentityConversationId] = useState<string | undefined>(undefined);
  // What the server says it is doing right now ("Checking our help articles"). Never made up here.
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Files the visitor has chosen for their next message (uploaded already, not yet sent). Only where the manager allows it.
  const [files, setFiles] = useState<{ id: string; filename: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);

  const {
    listening,
    transcribing,
    supported: voiceSupported,
    toggle: toggleVoice,
    error: voiceError,
  } = useDictation(
    (text) => {
      setValue((prev) => (prev ? `${prev} ` : "") + text);
      inputRef.current?.focus();
    },
    { siteToken: compact ? siteToken : undefined },
  );

  const conversationId = compact ? compactConversationId : (externalConversationId ?? undefined);
  const identity = compact || identityConversationId === conversationId ? storedIdentity : undefined;

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
        const raw = sessionStorage.getItem(storageKey(siteToken));
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
        setIdentity(stored.identity);
      } catch {
        sessionStorage.removeItem(storageKey(siteToken));
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
  }, [compact, identityReady, siteToken]);

  useEffect(() => {
    if (!compact || restoring) return;
    sessionStorage.setItem(
      storageKey(siteToken),
      JSON.stringify({ conversationId: compactConversationId, messages, escalated, identity } satisfies StoredChat),
    );
  }, [compact, compactConversationId, messages, escalated, identity, restoring, siteToken]);

  // Compact (public widget): the server holds the conversation, so a reload shows all of it and a manager's reply
  // appears without the visitor writing again. Checked on open and every few seconds, and not during a turn (the
  // turn's own reply is on its way). A failed check changes nothing: the saved copy stays on screen.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  useEffect(() => {
    if (!compact || restoring || !compactConversationId || !siteToken?.trim() || loading) return;
    let cancelled = false;
    async function sync() {
      if (document.visibilityState === "hidden") return;
      try {
        const server = await apiFetch<{ status: string; messages: Message[] }>(
          `/chat/messages?conversation_id=${encodeURIComponent(compactConversationId as string)}`,
          { widgetSiteToken: siteToken },
        );
        if (cancelled) return;
        const merged = mergeWidgetHistory(server.messages, messagesRef.current, welcomeMessage(profile));
        if (!sameMessages(merged, messagesRef.current)) setMessages(merged);
        setEscalated(server.status === "needs_human");
      } catch {
        // Keep what is on screen; the next check tries again.
      }
    }
    void sync();
    const timer = window.setInterval(() => void sync(), WIDGET_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, restoring, compactConversationId, siteToken, loading]);

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

  const canAttach = compact && Boolean(profile?.chatAttachments);

  async function attachFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFileError(null);
    setUploading(true);
    let held = files.length;
    try {
      for (const file of Array.from(list)) {
        if (held >= FILES_MAX) {
          setFileError(`You can attach up to ${FILES_MAX} files.`);
          break;
        }
        if (file.size > FILE_MAX_BYTES) {
          setFileError(`${file.name} is too big. The limit is ${FILE_MAX_BYTES / (1024 * 1024)} MB.`);
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        try {
          const saved = await apiFetch<{ id: string; filename: string; size: number }>("/chat/attachments", { method: "POST", body: form, widgetSiteToken: siteToken });
          setFiles((current) => [...current, { id: saved.id, filename: saved.filename, size: saved.size }]);
          held += 1;
        } catch (error) {
          setFileError(error instanceof WorkerApiError ? error.message : "That file couldn't be attached.");
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendText(text: string) {
    const sending = files;
    const trimmed = text.trim() || (sending.length > 0 ? "I've attached a file." : "");
    if (!trimmed || loading || uploading) return;
    setMessages((items) => [
      ...items,
      {
        id: `customer-${Date.now()}`,
        conversationId: conversationId ?? "",
        senderType: "customer",
        senderName: "You",
        body: sending.length > 0 ? `${trimmed}\n\n${attachedLines(sending)}` : trimmed,
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    setValue("");
    setFiles([]);
    setFileError(null);
    setStatusLabel(null);
    setLoading(true);
    try {
      // The server holds the history; the agent only carries this message.
      agent.setMessages([{ id: crypto.randomUUID(), role: "user", content: trimmed }]);
      let turn: ChatResponse | null = null;
      let failure: string | null = null;
      // Added as each arrives, so the reply shows at once and the ticket number joins it a few seconds later.
      const addReply = (message: Message) =>
        setMessages((items) => (items.some((item) => item.id === message.id) ? items : [...items, message]));
      await agent.runAgent(
        {
          forwardedProps: {
            conversation_id: conversationId,
            // A new chat on a device remembered from a verified visit starts verified, with no second code.
            ...(compact && !conversationId ? { remember_token: readRemembered(siteToken)?.token } : {}),
            ...(sending.length > 0 ? { attachment_ids: sending.map((file) => file.id) } : {}),
          },
        },
        {
          onCustomEvent: ({ event }) => {
            if (event.name === "chat.turn") {
              turn = event.value as ChatResponse;
              if (turn.message) addReply(turn.message as Message);
            }
            if (event.name === "chat.ticket") addReply(event.value as Message);
            if (event.name === "chat.status") {
              const label = (event.value as { label?: unknown } | null)?.label;
              if (typeof label === "string" && label.trim()) setStatusLabel(label.trim());
            }
          },
          onRunErrorEvent: ({ event }) => {
            failure = event.message;
          },
          onRunFailed: ({ error }) => {
            failure = error.message;
          },
        },
      );
      if (!turn) throw new Error(failure ?? "No reply came back");
      const response: ChatResponse = turn;
      if (compact && response.remembered) {
        setIdentity({ name: response.remembered.name ?? undefined, email: response.remembered.email, verified: true });
      }
      if (compact) {
        setCompactConversationId(response.conversation_id);
      } else {
        loadedIdRef.current = response.conversation_id;
        if (!externalConversationId) onConversationCreated?.(response.conversation_id);
        onConversationChanged?.();
      }
      if (response.message) addReply(response.message as Message);
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
      setStatusLabel(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const displayName = profile?.displayName ?? "AI Worker";
  const avatarInitials = profile?.avatarInitials ?? "AW";
  const accentColor = profile?.accentColor;
  const avatarUrl = profile?.avatarUrl;
  // "Not you?": forget this device and start a fresh chat that asks again.
  function startAsSomeoneElse() {
    forgetRemembered(siteToken);
    try {
      sessionStorage.removeItem(storageKey(siteToken));
    } catch {
      // Storage blocked: the reset below still applies to this view.
    }
    setCompactConversationId(undefined);
    setIdentity(undefined);
    setEscalated(false);
    setMessages([welcomeMessage(profile)]);
  }

  const isBlank = !compact && !externalConversationId && messages.length <= 1;
  const visibleMessages = messages.map((message) =>
    message.id === "welcome" ? welcomeMessage(profile) : message,
  );
  // Only the newest reply's quick replies can still be tapped.
  const latestReplyId = [...visibleMessages].reverse().find((message) => message.senderType === "agent")?.id;
  const cardActions = {
    busy: loading,
    onReply: (text: string) => void sendText(text),
    conversationId,
    siteToken: compact ? siteToken : undefined,
    identity,
    onIdentity: (next: ChatIdentity) => {
      setIdentity(next);
      setIdentityConversationId(conversationId);
    },
  };
  const showQuickActions = compact && !loading && messages.length <= 1 && quickActionsFor(profile).length > 0;

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
            <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {compact && identity?.verified ? (
                <>
                  <span className="truncate font-medium text-success-700 dark:text-success-400">Email verified</span>
                  <button type="button" onClick={startAsSomeoneElse} disabled={loading} className="shrink-0 underline decoration-dotted hover:text-gray-700 dark:hover:text-gray-200">
                    Not you?
                  </button>
                </>
              ) : (
                <span className="truncate">{compact ? "AI assistant" : "Online"}</span>
              )}
            </p>
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

      <CustomerCardsContext.Provider value={cardActions}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gray-25 p-4 [scrollbar-gutter:stable] dark:bg-gray-950/40 sm:p-5">
        {preview && (
          <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
            Preview response · API unreachable
          </div>
        )}
        {visibleMessages.map((message) => {
          const isAgent = message.senderType === "agent";
          // On the website a "manager" message is a person from the team writing to the visitor. In the Playground the
          // signed-in manager is the one typing, so theirs stays on the right like a visitor's.
          const isStaff = compact && message.senderType === "manager";
          const onLeft = isAgent || isStaff;
          return (
            <div key={message.id} className={`flex gap-2.5 ${onLeft ? "" : "flex-row-reverse"}`}>
              {isAgent ? (
                <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
              ) : isStaff ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  {message.senderName.trim().slice(0, 1).toUpperCase() || "T"}
                </span>
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-800">
                  Y
                </span>
              )}
              <div className={`max-w-[82%] ${onLeft ? "" : "text-right"}`}>
                {isStaff && <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{message.senderName} from the team</p>}
                <div
                  className={`break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-6 ${
                    onLeft
                      ? "rounded-tl-md border border-gray-200 bg-white text-gray-700 shadow-xs dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
                      : "rounded-tr-md bg-brand-500 text-white"
                  }`}
                >
                  {isAgent ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                </div>
                {isAgent && (message.cards ?? []).some(isCustomerCard) && (
                  <LatestReplyContext.Provider value={message.id === latestReplyId}>
                    <div className="mt-2 flex flex-col gap-2">
                      {(message.cards ?? []).filter(isCustomerCard).map((card) => (
                        <div key={card.id}>{renderToolCall(cardToolCall(card))}</div>
                      ))}
                    </div>
                  </LatestReplyContext.Provider>
                )}
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
              {quickActionsFor(profile).map((prompt) => (
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

        {showQuickActions && (
          <div className="flex flex-wrap gap-2 pl-10" role="group" aria-label="Quick actions">
            {quickActionsFor(profile).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void sendText(action)}
                className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-brand-500/30 dark:bg-white/[0.03] dark:text-brand-300 dark:hover:bg-brand-500/10"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2.5">
            <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.04]"
            >
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400" />
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
              </span>
              {statusLabel ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</span>
              ) : (
                <span className="sr-only">{displayName} is typing</span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      </CustomerCardsContext.Provider>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void sendText(value);
        }}
        className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4"
      >
        {canAttach && (files.length > 0 || uploading || fileError) && (
          <div className="mb-2 flex flex-col gap-1.5">
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <li key={file.id} className="flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200">
                    <span className="truncate">{file.filename}</span>
                    <span className="shrink-0 text-gray-400">{fileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                      aria-label={`Remove ${file.filename}`}
                      className="shrink-0 rounded px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {uploading && <p className="text-xs text-gray-500 dark:text-gray-400">Attaching…</p>}
            {fileError && <p role="alert" className="text-xs text-error-600 dark:text-error-500">{fileError}</p>}
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Please don't attach anything that shows client or patient details.</p>
          </div>
        )}
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
            placeholder={
              listening
                ? "Listening. Tap the mic when you are done."
                : transcribing
                  ? "Transcribing…"
                  : `Ask ${displayName} a question…`
            }
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
          />
          {canAttach && (
            <>
              <input
                ref={fileInputRef}
                id="chat-file-input"
                type="file"
                multiple
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(event) => void attachFiles(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || loading || files.length >= FILES_MAX}
                aria-label="Attach a file"
                title="Attach a file (image, PDF, text, CSV, Excel or Word, up to 10 MB)"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m21 11.5-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!voiceSupported || transcribing}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            aria-pressed={listening}
            title={
              voiceSupported
                ? transcribing
                  ? "Transcribing…"
                  : listening
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
            disabled={(!value.trim() && files.length === 0) || loading || uploading}
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
