"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import Markdown from "@/components/mike/Markdown";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { DocsIcon, PaperPlaneIcon } from "@/icons";
import { apiFetch, Message } from "@/lib/mike-api";
import { FormEvent, useRef, useState } from "react";

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

export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [conversationId, setConversationId] = useState<string>();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [preview, setPreview] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (!text || loading) return;
    const customerMessage: Message = {
      id: `customer-${Date.now()}`,
      sender_type: "customer",
      sender_name: "You",
      body: text,
      citations: [],
      created_at: new Date().toISOString(),
    };
    setMessages((items) => [...items, customerMessage]);
    setValue("");
    setLoading(true);
    try {
      const response = await apiFetch<ChatApiResponse>("/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, conversation_id: conversationId, customer_name: "Website visitor" }),
      });
      setConversationId(response.conversation_id);
      setMessages((items) => [...items, response.message]);
      setEscalated(response.escalated);
    } catch {
      setPreview(true);
      setMessages((items) => [...items, {
        id: `mike-${Date.now()}`,
        sender_type: "agent",
        sender_name: "Agent Mike",
        body: "I can’t reach the support service right now, so I can’t answer confidently. Please try again in a moment—if it keeps happening, a human on the team will follow up.",
        citations: [],
        created_at: new Date().toISOString(),
      }]);
      setEscalated(true);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900 ${compact ? "rounded-2xl" : "rounded-2xl border border-gray-200 dark:border-gray-800"}`}>
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <AgentAvatar name="Mike" size="md" showStatus />
          <div><p className="text-sm font-semibold text-gray-800 dark:text-white/90">Agent Mike</p><p className="text-xs text-gray-500 dark:text-gray-400">Level 1 support · Online</p></div>
        </div>
        <Badge size="sm" color={escalated ? "warning" : "success"}>{escalated ? "Manager notified" : "Typically replies instantly"}</Badge>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-gray-25 p-4 dark:bg-gray-950/40 sm:p-5">
        {preview && <div className="mx-auto max-w-md rounded-lg bg-warning-50 px-3 py-2 text-center text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">Preview response · API is not running</div>}
        {messages.map((message) => {
          const mike = message.sender_type === "agent";
          return (
            <div key={message.id} className={`flex gap-2.5 ${mike ? "" : "flex-row-reverse"}`}>
              {mike ? <AgentAvatar name="Mike" size="sm" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white dark:bg-gray-200 dark:text-gray-800">Y</span>}
              <div className={`max-w-[82%] ${mike ? "" : "text-right"}`}>
                <div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${mike ? "rounded-tl-md border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200" : "rounded-tr-md bg-brand-500 text-white"}`}>
                  {mike ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                </div>
                {message.citations.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.citations.map((citation) => <span key={citation.concept_id} className="inline-flex items-center gap-1 rounded-lg bg-blue-light-50 px-2 py-1 text-[11px] font-medium text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-300"><DocsIcon className="size-3" />{citation.title}</span>)}</div>}
              </div>
            </div>
          );
        })}
        {loading && <div className="flex items-center gap-2.5"><AgentAvatar name="Mike" size="sm" /><div className="flex gap-1 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.04]"><span className="size-1.5 animate-pulse rounded-full bg-gray-400" /><span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" /></div></div>}
      </div>

      <form onSubmit={submit} className="border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
          <textarea ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder="Ask Mike a product question…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90" />
          <button type="submit" disabled={!value.trim() || loading} aria-label="Send message" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"><PaperPlaneIcon className="size-4" /></button>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">Mike can make mistakes. Sensitive requests go to a human.</p>
      </form>
    </div>
  );
}

export default function ChatExperience() {
  return (
    <div className="grid min-h-[calc(100vh-128px)] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] md:gap-6">
      <ChatPanel />
      <aside className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <Badge size="sm" color="info">Test bench</Badge>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Try the customer experience</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Messages use Mike’s live identity, guardrails, and OKF knowledge. Try a documented question, then a refund or security request to test handoff.</p>
          <div className="mt-5 space-y-2">
            {["My sign-in code never arrived", "How do I invite a teammate?", "I need a refund for my last charge"].map((prompt) => <div key={prompt} className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">“{prompt}”</div>)}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Website install</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The embeddable experience is ready at <code className="font-mono text-xs text-gray-700 dark:text-gray-300">/widget</code>.</p>
          <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => navigator.clipboard?.writeText(`<iframe src="${window.location.origin}/widget" title="Chat with Mike"></iframe>`)}>Copy embed snippet</Button>
        </div>
      </aside>
    </div>
  );
}

