"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AssistantApprovalCard from "@/components/worker/AssistantApprovalCard";
import {
  SentAttachmentChips,
  StagedAttachmentChips,
  type StagedAttachment,
} from "@/components/worker/AssistantAttachmentChips";
import AssistantHistoryPanel from "@/components/worker/AssistantHistoryPanel";
import AssistantPanel from "@/components/worker/AssistantPanel";
import Markdown from "@/components/worker/Markdown";
import {
  ArrowUpIcon,
  BoxCubeIcon,
  ChatIcon,
  DocsIcon,
  EnvelopeIcon,
  MicrophoneIcon,
  PlugInIcon,
  PlusIcon,
  ShootingStarIcon,
  TimeIcon,
} from "@/icons";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useWorkerIdentityDisplay } from "@/context/WorkerIdentityContext";
import {
  apiFetch,
  AssistantChatResponse,
  AssistantConnectLink,
  AssistantPanelKind,
  AssistantPendingAction,
  AttachmentIntent,
  Conversation,
  Message,
  uploadAssistantAttachments,
  WorkerApiError,
  WorkerProfile,
} from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";
import {
  isPendingConversation,
  lastConversationKey,
  markPendingConversation,
  readDraft,
  readLastConversation,
  rememberLastConversation,
  saveDraft,
  subscribeToLastConversation,
} from "@/lib/assistant-session";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";

const MESSAGE_MAX_LENGTH = 4000;
const MAX_ATTACHMENTS = 5;
// Matches the API's own cap (lib/assistant-attachments.ts), checked here too
// so an oversized file fails instantly instead of after uploading.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.md,.markdown,.txt,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log";

// Short label for the chip button, full sentence actually sent on click -
// same split Jules uses (compact pills, longer prompt underneath). Generic
// across whatever this worker is configured to do: no "ticket", no
// "refund" - this page ships for any AI Worker persona, not just support.
// Quick access to the interactive panels, shown straight away with no model
// turn. Same icons as the Settings nav, so each reads as that section.
const PANEL_SHORTCUTS: { label: string; kind: AssistantPanelKind; icon: typeof DocsIcon }[] = [
  { label: "Skills", kind: "skills", icon: ShootingStarIcon },
  { label: "Knowledge", kind: "knowledge", icon: DocsIcon },
  { label: "Integrations", kind: "integrations", icon: PlugInIcon },
  { label: "Tools", kind: "tools", icon: BoxCubeIcon },
  { label: "Channels", kind: "channels", icon: ChatIcon },
  { label: "Email domains", kind: "email_domains", icon: EnvelopeIcon },
];

// Short label on the button, fuller question actually sent. Generic across
// whatever this worker is configured to do (no "ticket", no "refund").
const SUGGESTED_PROMPTS = [
  { label: "Check my setup", prompt: "Check my worker's setup and tell me what's missing or wrong" },
  { label: "What needs my attention?", prompt: "Which conversations are open or waiting for me right now?" },
  { label: "Summarize the latest escalation", prompt: "Summarize my most recently escalated conversation" },
  { label: "Draft a reply for me", prompt: "Draft a reply to my most recent open conversation" },
  { label: "Explain my guardrails", prompt: "What does my current guardrail escalate on, and what does each guardrail setting do?" },
  { label: "What's in my knowledge base?", prompt: "What topics does my knowledge base cover?" },
];

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function WorkerAssistant() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  // The open chat lives in the URL (?c=<id>), so a reload, the back button,
  // leaving for Settings, or Chrome discarding the tab all come back to it.
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");
  const startedNew = searchParams.has("new");
  const { userId, orgId, isLoaded: authLoaded } = useAuth();
  const lastKey = lastConversationKey(userId, orgId);
  const storedLast = useSyncExternalStore(
    subscribeToLastConversation,
    () => readLastConversation(lastKey),
    () => null,
  );
  // Opening Assistant with no chat in the URL (the sidebar link) reopens the
  // last one, until the manager explicitly starts a new chat.
  const restoreTarget = !conversationId && !startedNew ? storedLast : null;
  const [notice, setNotice] = useState<string | null>(null);
  // A reply that was still being written when the manager left and came back.
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [canChange, setCanChange] = useState(true);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preview, setPreview] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [pendingActions, setPendingActions] = useState<AssistantPendingAction[]>([]);
  // Only kept for replies received in this session - the activity line is a
  // live "what I just did", not part of the stored transcript.
  const [toolsByMessage, setToolsByMessage] = useState<Record<string, string[]>>({});
  const [dragActive, setDragActive] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Bumped after anything that may change what a panel shows, so every
  // open panel re-reads live state.
  const [panelRefresh, setPanelRefresh] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Local ids for optimistic messages and staged files, until the server's own ids replace them.
  const localIdRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<string | null>(null);
  // Name/avatar come from the shared identity (cached seed until "/worker"
  // resolves), not this page's own fetch, so a reload doesn't flash "AW".
  const identity = useWorkerIdentityDisplay("your worker");
  const { avatarInitials, accentColor, avatarUrl } = identity;
  const displayName = identity.displayName || "your worker";

  const { listening, supported: voiceSupported, toggle: toggleVoice, error: voiceError } = useVoiceInput((text) => {
    setValue((prev) => (prev ? `${prev} ` : "") + text);
    inputRef.current?.focus();
  });

  function openConversation(id: string | null, mode: "push" | "replace" = "push") {
    const url = id ? `/assistant?c=${id}` : "/assistant?new=1";
    if (mode === "replace") router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  useEffect(() => {
    if (restoreTarget) router.replace(`/assistant?c=${restoreTarget}`, { scroll: false });
  }, [restoreTarget, router]);

  useEffect(() => {
    if (conversationId) rememberLastConversation(lastKey, conversationId);
  }, [conversationId, lastKey]);

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
      setPendingActions([]);
      setAwaitingReply(false);
      return;
    }
    if (loadedIdRef.current === conversationId) return; // already showing it (e.g. just created)
    loadedIdRef.current = conversationId;
    let cancelled = false;
    let finished = false;
    let timer: number | undefined;

    const apply = (conversation: Conversation) => {
      setMessages(conversation.messages ?? []);
      setConversationTitle(conversation.subject ?? null);
      setPendingActions(conversation.pendingActions ?? []);
      if (typeof conversation.canChange === "boolean") setCanChange(conversation.canChange);
    };
    const lastIsUnanswered = (conversation: Conversation) => {
      const last = conversation.messages?.[conversation.messages.length - 1];
      return last?.senderType === "manager";
    };

    (async () => {
      const draft = readDraft(conversationId);
      if (draft) {
        setValue(draft.text);
        setStaged(
          draft.files.map((file, index) => ({
            localId: `restored-${conversationId}-${index}`,
            id: file.id,
            filename: file.filename,
            intent: file.intent,
            status: "ready" as const,
          })),
        );
      }
      // A just-sent new chat may not be saved on the server for a moment yet.
      for (let attempt = 0; ; attempt++) {
        try {
          const conversation = await apiFetch<Conversation>(`/conversations/${conversationId}`);
          if (cancelled) return;
          finished = true;
          apply(conversation);
          if (lastIsUnanswered(conversation) || isPendingConversation(conversationId)) {
            // Left while a reply was being written: show that, and pick the
            // reply up as soon as the server has it.
            setAwaitingReply(true);
            let polls = 0;
            const poll = async () => {
              polls += 1;
              const next = await apiFetch<Conversation>(`/conversations/${conversationId}`).catch(() => null);
              if (cancelled) return;
              if (next && !lastIsUnanswered(next)) {
                apply(next);
                setAwaitingReply(false);
                markPendingConversation(conversationId, false);
              } else if (polls < 60) {
                timer = window.setTimeout(poll, 3000);
              } else {
                setAwaitingReply(false);
                markPendingConversation(conversationId, false);
                setNotice("That reply is taking longer than expected. Send your message again if nothing shows up.");
              }
            };
            timer = window.setTimeout(poll, 3000);
          }
          return;
        } catch (error) {
          if (cancelled) return;
          const missing = error instanceof WorkerApiError && error.status === 404;
          if (missing && isPendingConversation(conversationId) && attempt < 5) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          if (missing) {
            // Archived elsewhere, or no longer exists: fall back to a new chat.
            markPendingConversation(conversationId, false);
            rememberLastConversation(lastKey, null);
            setNotice("That chat isn't available anymore, so here's a new one.");
            openConversation(null, "replace");
          } else {
            setMessages([]);
          }
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      // Cancelled before it loaded (React's dev double-mount, or a quick
      // switch): let the next run fetch it instead of skipping as "loaded".
      if (!finished && loadedIdRef.current === conversationId) loadedIdRef.current = null;
    };
    // openConversation/lastKey only change with auth or navigation; the id drives loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Unsent text and files are kept per chat for this browser session.
  useEffect(() => {
    saveDraft(conversationId, {
      text: value,
      files: staged
        .filter((item) => item.status === "ready" && item.id)
        .map((item) => ({ id: item.id!, filename: item.filename, intent: item.intent })),
    });
  }, [conversationId, value, staged]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setAttachError(null);
    const room = MAX_ATTACHMENTS - staged.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) setAttachError(`Only the first ${room} file(s) were added (max ${MAX_ATTACHMENTS} per message).`);

    const entries: StagedAttachment[] = accepted.map((file, index) => ({
      localId: `file-${++localIdRef.current}-${index}`,
      filename: file.name,
      intent: "context",
      status: file.size > MAX_ATTACHMENT_BYTES ? "error" : "uploading",
      error: file.size > MAX_ATTACHMENT_BYTES ? "Larger than 8 MB." : undefined,
    }));
    setStaged((prev) => [...prev, ...entries]);
    const update = (localId: string, patch: Partial<StagedAttachment>) =>
      setStaged((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));

    // One request per file: the API proxy caps each request body at 10 MB,
    // so batching several files into one upload could get it cut off.
    await Promise.all(
      accepted.map(async (file, index) => {
        const entry = entries[index];
        if (entry.status === "error") return;
        try {
          const [result] = await uploadAssistantAttachments([file]);
          if (!result) update(entry.localId, { status: "error", error: "Upload failed." });
          else if (result.ok) update(entry.localId, { status: "ready", id: result.id, truncated: result.truncated });
          else update(entry.localId, { status: "error", error: result.error });
        } catch (error) {
          update(entry.localId, { status: "error", error: error instanceof Error ? error.message : "Upload failed." });
        }
      }),
    );
  }

  function addLocalAgentMessage(body: string) {
    setMessages((items) => [
      ...items,
      {
        id: `local-agent-${++localIdRef.current}`,
        conversationId: conversationId ?? "",
        senderType: "agent",
        senderName: `${displayName} Assistant`,
        body,
        citations: [],
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  /**
   * After an approved "Connect X": send the sign-in window to the provider,
   * then watch the connection until it's live (or the window is closed), so
   * the manager never has to leave the chat or refresh anything.
   */
  function followConnection(link: AssistantConnectLink, popup: Window | null) {
    const target = popup && !popup.closed ? popup : window.open(link.url, "aix-connect", "width=520,height=720");
    if (!target) {
      addLocalAgentMessage(`Your browser blocked the sign-in window. [Open the ${link.label} sign-in](${link.url}) to finish connecting.`);
      return;
    }
    if (target === popup) target.location.href = link.url;
    // Every 3s for up to 5 minutes.
    let ticks = 0;
    const check = async (): Promise<boolean> => {
      if (link.kind === "mailbox") {
        const mailbox = await apiFetch<{ connected?: boolean }>("/mailbox").catch(() => null);
        return Boolean(mailbox?.connected);
      }
      const row = await apiFetch<{ status?: string } | null>(`/integrations/${link.integrationType}`).catch(() => null);
      return row?.status === "active";
    };
    const timer = window.setInterval(async () => {
      const connected = await check();
      const gaveUp = ++ticks > 100;
      if (connected) {
        window.clearInterval(timer);
        if (!target.closed) target.close();
        setPanelRefresh((n) => n + 1);
        addLocalAgentMessage(`${link.label} is connected now. The worker can start using it right away.`);
      } else if (target.closed || gaveUp) {
        window.clearInterval(timer);
        setPanelRefresh((n) => n + 1);
        addLocalAgentMessage(
          `It looks like the ${link.label} sign-in didn't finish, so nothing is connected yet. You can try again from the panel whenever you're ready.`,
        );
      }
    }, 3000);
  }

  type SendOptions = {
    decision?: "approve" | "cancel";
    uiAction?: { tool: string; args: Record<string, unknown>; label: string };
    showPanel?: AssistantPanelKind;
    /** Opened synchronously from the click, so popup blockers allow it. */
    popup?: Window | null;
  };

  async function send(text: string, options: SendOptions = {}) {
    const { decision, uiAction, showPanel, popup } = options;
    const structured = Boolean(decision || uiAction || showPanel);
    const trimmed = text.trim();
    const ready = structured ? [] : staged.filter((item) => item.status === "ready" && item.id);
    if (loading || (!trimmed && ready.length === 0 && !structured)) {
      popup?.close();
      return;
    }
    if (!structured && staged.some((item) => item.status === "uploading")) return;

    const managerName = profile?.managerName ?? "You";
    const shownText =
      trimmed ||
      (decision ? (decision === "approve" ? "Approve" : "Cancel") : uiAction ? uiAction.label : "(Attached files)");
    const approvalIds = decision ? pendingActions.map((action) => action.id) : [];
    if (!conversationId && !conversationTitle) setConversationTitle(shownText.slice(0, 120));
    // A new chat gets its id now, so it's in the URL before the reply comes
    // back: leaving mid-reply and returning finds it instead of a blank chat.
    const newConversationId = conversationId ? null : crypto.randomUUID();
    if (newConversationId) {
      markPendingConversation(newConversationId, true);
      loadedIdRef.current = newConversationId;
      saveDraft(null, { text: "", files: [] });
      openConversation(newConversationId, "replace");
    }
    setNotice(null);
    const optimisticId = `manager-local-${++localIdRef.current}`;
    setMessages((items) => [
      ...items,
      {
        id: optimisticId,
        conversationId: conversationId ?? "",
        senderType: "manager",
        senderName: managerName,
        body: shownText,
        citations: [],
        attachments: ready.map((item) => ({ id: item.id!, filename: item.filename, intent: item.intent })),
        createdAt: new Date().toISOString(),
      },
    ]);
    const stagedBefore = staged;
    if (!structured) {
      setValue("");
      setStaged([]);
      setAttachError(null);
    }
    setPendingActions([]);
    setLoading(true);
    try {
      const response = await apiFetch<AssistantChatResponse>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed || (showPanel ? shownText : undefined),
          conversation_id: conversationId ?? undefined,
          new_conversation_id: newConversationId ?? undefined,
          attachments: ready.length ? ready.map((item) => ({ id: item.id, intent: item.intent })) : undefined,
          approval_decision: decision ? { decision, approval_ids: approvalIds } : undefined,
          ui_action: uiAction ? { tool: uiAction.tool, args: uiAction.args, label: uiAction.label } : undefined,
          show_panel: showPanel,
        }),
      });
      loadedIdRef.current = response.conversation_id;
      const isNew = !conversationId;
      if (newConversationId) markPendingConversation(newConversationId, false);
      if (response.conversation_id !== (conversationId ?? newConversationId)) {
        openConversation(response.conversation_id, "replace");
      }
      if (typeof response.can_change === "boolean") setCanChange(response.can_change);
      if (isNew) setRefreshKey((k) => k + 1);
      if (response.conversation_title) setConversationTitle(response.conversation_title);
      setMessages((items) => [
        ...items.map((item) => (item.id === optimisticId && response.user_message ? response.user_message : item)),
        response.message,
      ]);
      setPendingActions(response.pending_actions ?? []);
      if (response.changes_applied) {
        setPanelRefresh((n) => n + 1);
        // Tell the sidebar, favicon, and this page about the new name/avatar/etc.
        // - the same event Settings fires after saving.
        void apiFetch<WorkerProfile>("/worker")
          .then((next) => window.dispatchEvent(new CustomEvent(IDENTITY_UPDATED_EVENT, { detail: next })))
          .catch(() => undefined);
      }
      if (response.connect_link) followConnection(response.connect_link, popup ?? null);
      else popup?.close();
      if (response.tools_used?.length) {
        setToolsByMessage((prev) => ({ ...prev, [response.message.id]: response.tools_used }));
      }
      setPreview(false);
    } catch (error) {
      popup?.close();
      setPreview(true);
      // Nothing was sent, so give the manager their files back to retry.
      if (!structured) setStaged(stagedBefore);
      const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
      setMessages((items) => [
        ...items,
        {
          id: `fallback-${Date.now()}`,
          conversationId: conversationId ?? "",
          senderType: "agent",
          senderName: `${profile ? displayName : "Your worker"} Assistant`,
          body: `Sorry, I couldn't finish that${detail}. Nothing was changed, so feel free to try again in a moment.`,
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function sendText(text: string) {
    return send(text);
  }

  function decide(decision: "approve" | "cancel") {
    // Must open here, inside the click, or the browser blocks it as a popup.
    const popup =
      decision === "approve" && pendingActions.some((action) => action.opensSignIn)
        ? window.open("about:blank", "aix-connect", "width=520,height=720")
        : null;
    void send("", { decision, popup });
  }

  function startNew() {
    // The only way (besides archiving the open chat) that the Assistant stops
    // reopening the current conversation.
    rememberLastConversation(lastKey, null);
    setNotice(null);
    openConversation(null);
    setMessages([]);
    setConversationTitle(null);
    setValue("");
    setStaged([]);
    setPendingActions([]);
    setAttachError(null);
    inputRef.current?.focus();
  }

  const managerName = profile?.managerName;
  // Until sign-in state is known we can't tell whether a chat is about to be
  // restored, so hold the start screen rather than flash it.
  const isBlank = !conversationId && !restoreTarget && (startedNew || authLoaded) && messages.length === 0;
  const uploading = staged.some((item) => item.status === "uploading");
  const hasReadyFiles = staged.some((item) => item.status === "ready");

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
          {notice && (
            <div className="mx-auto max-w-md rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {notice}
            </div>
          )}
          {preview && (
            <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
              Couldn&apos;t reach the assistant
            </div>
          )}

          {isBlank && !loading ? (
            <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-3 py-4 text-center">
              <AgentAvatar initials={avatarInitials} size="lg" accentColor={accentColor} avatarUrl={avatarUrl} />
              <p className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {greetingForHour(new Date().getHours())}
                {managerName ? `, ${managerName}` : ""}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ask about your conversations, change any setting, draft replies, or attach files for your
                knowledge base.
              </p>
              <div className="mt-4 w-full space-y-5 text-left">
                <section aria-labelledby="assistant-setup-shortcuts">
                  <h2
                    id="assistant-setup-shortcuts"
                    className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
                  >
                    Your setup
                  </h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PANEL_SHORTCUTS.map(({ label, kind, icon: Icon }) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => void send(`Show ${label.toLowerCase()}`, { showPanel: kind })}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-white/[0.06]"
                      >
                        <Icon className="size-4 shrink-0 text-gray-400 dark:text-gray-500" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section aria-labelledby="assistant-suggested-prompts">
                  <h2
                    id="assistant-suggested-prompts"
                    className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
                  >
                    Try asking
                  </h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SUGGESTED_PROMPTS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => void sendText(item.prompt)}
                        className="truncate rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>
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
                      {toolsByMessage[message.id]?.length ? (
                        <p className="mb-1 text-[11px] text-gray-400 dark:text-gray-500">
                          {toolsByMessage[message.id].join(" · ")}
                        </p>
                      ) : null}
                      <Markdown>{message.body}</Markdown>
                      {(message.panels ?? []).map((kind) => (
                        <AssistantPanel
                          key={kind}
                          kind={kind}
                          refreshToken={panelRefresh}
                          disabled={loading}
                          onAction={(action, item) =>
                            void send("", {
                              uiAction: { tool: action.tool, args: action.args, label: `${action.label}: ${item.title}` },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex flex-col items-end">
                    <SentAttachmentChips attachments={message.attachments ?? []} />
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand-500 px-4 py-3 text-left text-sm leading-6 text-white">
                      {message.body}
                    </p>
                  </div>
                );
              })}

              {!loading && (
                <AssistantApprovalCard actions={pendingActions} busy={loading} readOnly={!canChange} onDecide={decide} />
              )}

              {awaitingReply && !loading && (
                <div className="flex items-center gap-2.5">
                  <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Still working on your last message…</p>
                </div>
              )}

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
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            setDragActive(false);
            void addFiles(event.dataTransfer.files);
          }}
          className="mt-auto shrink-0 px-4 pb-3 sm:px-6 sm:pb-4"
        >
          <div
            className={`glass-surface mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl p-3.5 shadow-lg shadow-gray-900/10 outline outline-2 outline-offset-1 transition-[outline-color] focus-within:outline-brand-500 dark:shadow-black/30 ${
              dragActive ? "outline-brand-400" : "outline-transparent"
            }`}
          >
            <StagedAttachmentChips
              attachments={staged}
              onIntentChange={(localId, intent: AttachmentIntent) =>
                setStaged((prev) => prev.map((item) => (item.localId === localId ? { ...item, intent } : item)))
              }
              onRemove={(localId) => setStaged((prev) => prev.filter((item) => item.localId !== localId))}
            />
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
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={staged.length >= MAX_ATTACHMENTS}
                aria-label="Add files"
                title="Add files: PDF, Markdown, text, CSV, JSON, HTML, YAML (up to 5, 8 MB each)"
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              >
                <PlusIcon className="size-4" />
                <span className="hidden sm:inline">Add files</span>
              </button>
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
                disabled={(!value.trim() && !hasReadyFiles) || loading || uploading}
                aria-label="Send message"
                title="Send message"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-gray-500 dark:text-gray-400">
            {attachError ??
              voiceError ??
              "Answers questions, guides your setup, and drafts replies. It never changes anything without your approval."}
          </p>
        </form>
      </div>
      <AssistantHistoryPanel
        selectedId={conversationId}
        refreshKey={refreshKey}
        open={historyOpen}
        onSelect={(id) => openConversation(id)}
        onNew={startNew}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
