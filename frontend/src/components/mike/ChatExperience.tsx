"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import Markdown from "@/components/mike/Markdown";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { DocsIcon, PaperPlaneIcon } from "@/icons";
import { apiFetch, Conversation, Message } from "@/lib/mike-api";
import { FormEvent, useEffect, useRef, useState } from "react";

type ChatApiResponse = {
  conversation_id: string;
  message: Message;
  status: string;
  confidence: number;
  escalated: boolean;
};

const welcome: Message = {
  id: "welcome",
  sender_type: "agent",
  sender_name: "Agent Mike",
  body: "Hi! I’m Mike. I can help with setup, access, and everyday product questions. What are you working on?",
  citations: [],
  created_at: new Date().toISOString(),
};

const SAMPLE_PROMPTS = [
  "My sign-in code never arrived",
  "How do I invite a teammate?",
  "I need a refund for my last charge",
];

function storageKey(compact: boolean) {
  return compact ? "mike.widget.chat.v1" : "mike.manager.chat.v1";
}

type StoredChat = {
  conversationId?: string;
  messages: Message[];
  escalated?: boolean;
};

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatPanel({
  compact = false,
  onReady,
}: {
  compact?: boolean;
  onReady?: (api: { sendPrompt: (text: string) => void }) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [conversationId, setConversationId] = useState<string>();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [preview, setPreview] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = sessionStorage.getItem(storageKey(compact));
        if (!raw) return;
        const stored = JSON.parse(raw) as StoredChat;
        if (!stored.conversationId) {
          if (stored.messages?.length) {
            setMessages(stored.messages);
            setEscalated(Boolean(stored.escalated));
          }
          return;
        }
        if (compact) {
          setConversationId(stored.conversationId);
          if (stored.messages?.length) setMessages(stored.messages);
          setEscalated(Boolean(stored.escalated));
          return;
        }
        const conversation = await apiFetch<Conversation>(`/conversations/${stored.conversationId}`);
        if (cancelled) return;
        setConversationId(conversation.id);
        setEscalated(
          conversation.status === "needs_human" || conversation.status === "human_active",
        );
        const restored = conversation.messages?.length
          ? conversation.messages
          : stored.messages?.length
            ? stored.messages
            : [welcome];
        setMessages(
          restored[0]?.id === "welcome" || restored[0]?.sender_type === "agent"
            ? restored
            : [welcome, ...restored],
        );
      } catch {
        sessionStorage.removeItem(storageKey(compact));
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [compact]);

  useEffect(() => {
    if (restoring) return;
    sessionStorage.setItem(
      storageKey(compact),
      JSON.stringify({ conversationId, messages, escalated } satisfies StoredChat),
    );
  }, [compact, conversationId, messages, escalated, restoring]);

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
        sender_type: "customer",
        sender_name: "You",
        body: trimmed,
        citations: [],
        created_at: new Date().toISOString(),
      },
    ]);
    setValue("");
    setLoading(true);
    try {
      const response = await apiFetch<ChatApiResponse>("/chat", {
        method: "POST",
        widget: compact,
        body: JSON.stringify({
          message: trimmed,
          conversation_id: conversationId,
          customer_name: "Website visitor",
        }),
      });
      setConversationId(response.conversation_id);
      setMessages((items) => [...items, response.message]);
      setEscalated(response.escalated);
      setPreview(false);
    } catch {
      setPreview(true);
      setMessages((items) => [
        ...items,
        {
          id: `mike-${Date.now()}`,
          sender_type: "agent",
          sender_name: "Agent Mike",
          body: "I can’t reach the support service right now, so I can’t answer confidently. Please try again in a moment—if it keeps happening, a human on the team will follow up.",
          citations: [],
          created_at: new Date().toISOString(),
        },
      ]);
      setEscalated(true);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }
  sendTextRef.current = sendText;

  useEffect(() => {
    onReady?.({ sendPrompt: (text: string) => void sendTextRef.current(text) });
  }, [onReady]);

  async function startNewChat() {
    sessionStorage.removeItem(storageKey(compact));
    setConversationId(undefined);
    setMessages([{ ...welcome, created_at: new Date().toISOString() }]);
    setEscalated(false);
    setPreview(false);
    setValue("");
    inputRef.current?.focus();
  }

  async function toggleRecording() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreview(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "mike-voice.webm");
          const result = await apiFetch<{ text: string }>("/transcribe", {
            method: "POST",
            widget: compact,
            body: form,
          });
          const text = (result.text || "").trim();
          if (text) setValue((current) => (current ? `${current.trim()} ${text}` : text));
        } catch {
          setPreview(true);
        } finally {
          setTranscribing(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setPreview(true);
    }
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-900 ${
        compact ? "rounded-2xl" : "rounded-2xl border border-gray-200 dark:border-gray-800"
      }`}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar name="Mike" size="md" showStatus />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">Agent Mike</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">Level 1 support · Online</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(conversationId || messages.length > 1) && (
            <button
              type="button"
              onClick={() => void startNewChat()}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              New chat
            </button>
          )}
          <Badge size="sm" color={escalated ? "warning" : "success"}>
            {escalated ? "Manager notified" : "Typically replies instantly"}
          </Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gray-25 p-4 dark:bg-gray-950/40 sm:p-5">
        {preview && (
          <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
            Preview response · API unreachable or voice transcription failed
          </div>
        )}
        {messages.map((message) => {
          const mike = message.sender_type === "agent";
          return (
            <div key={message.id} className={`flex gap-2.5 ${mike ? "" : "flex-row-reverse"}`}>
              {mike ? (
                <AgentAvatar name="Mike" size="sm" />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-800">
                  Y
                </span>
              )}
              <div className={`max-w-[82%] ${mike ? "" : "text-right"}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${
                    mike
                      ? "rounded-tl-md border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
                      : "rounded-tr-md bg-brand-500 text-white"
                  }`}
                >
                  {mike ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                </div>
                {message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.citations.map((citation) => (
                      <span
                        key={`${message.id}-${citation.concept_id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-light-50 px-2 py-1 text-[11px] font-medium text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-300"
                      >
                        <DocsIcon className="size-3" />
                        {citation.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center gap-2.5">
            <AgentAvatar name="Mike" size="sm" />
            <div className="flex gap-1 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.04]">
              <span className="size-1.5 animate-pulse rounded-full bg-gray-400" />
              <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void sendText(value); }} className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => void toggleRecording()}
            disabled={loading || transcribing}
            aria-label={recording ? "Stop recording" : "Dictate with microphone"}
            title={recording ? "Stop recording" : "Dictate with microphone"}
            aria-pressed={recording}
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              recording
                ? "bg-error-500 text-white hover:bg-error-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <MicIcon className="size-4" />
          </button>
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
            placeholder={
              recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask Mike a product question…"
            }
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
          />
          <button
            type="submit"
            disabled={!value.trim() || loading}
            aria-label="Send message"
            title="Send message"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            <PaperPlaneIcon className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
          Mike can make mistakes. Sensitive requests go to a human.
        </p>
      </form>
    </div>
  );
}

export default function ChatExperience() {
  const chatApiRef = useRef<{ sendPrompt: (text: string) => void } | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_280px] md:gap-6">
      <div className="min-h-0 min-w-0 h-full">
        <ChatPanel onReady={(api) => { chatApiRef.current = api; }} />
      </div>
      <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain xl:flex">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <Badge size="sm" color="info">
            Test bench
          </Badge>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Try the customer experience
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Live identity, guardrails, and OKF knowledge. Prompts send into the chat. History restores from
            Postgres for this browser session.
          </p>
          <div className="mt-5 space-y-2">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left text-xs text-gray-600 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
                onClick={() => chatApiRef.current?.sendPrompt(prompt)}
              >
                “{prompt}”
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Website install</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Embed ready at <code className="font-mono text-xs text-gray-700 dark:text-gray-300">/widget</code>.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 w-full"
            onClick={() =>
              navigator.clipboard?.writeText(
                `<iframe src="${window.location.origin}/widget" title="Chat with Mike"></iframe>`,
              )
            }
          >
            Copy embed snippet
          </Button>
        </div>
      </aside>
    </div>
  );
}
