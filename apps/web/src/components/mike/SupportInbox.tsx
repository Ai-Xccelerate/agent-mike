"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import Markdown from "@/components/mike/Markdown";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ChatIcon, CheckCircleIcon, DocsIcon, MailIcon, PaperPlaneIcon, TrashBinIcon, UserCircleIcon } from "@/icons";
import { apiFetch, Conversation } from "@/lib/mike-api";
import { useEffect, useMemo, useState } from "react";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

type BadgeInfo = { label: string; color: "info" | "success" | "warning" | "primary" | "light" };

const statusDetails: Record<string, BadgeInfo> = {
  open: { label: "Open", color: "info" },
  resolved: { label: "Resolved", color: "success" },
  needs_human: { label: "Needs review", color: "warning" },
  human_active: { label: "Human active", color: "primary" },
  closed: { label: "Closed", color: "light" },
};

function badgeFor(conversation: Conversation): BadgeInfo {
  if (conversation.status === "needs_human") {
    return conversation.priority === "high"
      ? { label: "Needs review", color: "warning" }
      : { label: "Follow-up", color: "info" };
  }
  return statusDetails[conversation.status] ?? { label: conversation.status, color: "light" };
}

function ticketRef(conversation: Conversation) {
  return conversation.ticket_number
    ? `EAPX-${conversation.ticket_number}`
    : "EAPX-" + conversation.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

const ACTIVE_HIDDEN = new Set(["resolved", "closed"]);

export default function SupportInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"active" | "needs_human" | "closed">("active");
  const [updating, setUpdating] = useState(false);
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiFetch<Conversation[]>("/conversations")
      .then((data) => setConversations(data))
      .catch(() => undefined);
  }, []);

  const needsHumanCount = useMemo(
    () => conversations.filter((item) => item.status === "needs_human").length,
    [conversations]
  );

  const visible = useMemo(() => {
    if (filter === "needs_human") return conversations.filter((item) => item.status === "needs_human");
    if (filter === "closed") return conversations.filter((item) => ACTIVE_HIDDEN.has(item.status));
    return conversations.filter((item) => !ACTIVE_HIDDEN.has(item.status));
  }, [conversations, filter]);
  // `selected` is strictly the ticket referenced by selectedId — never a positional
  // fallback — so a manager action always targets the ticket that is displayed.
  const selected = conversations.find((item) => item.id === selectedId);

  useEffect(() => {
    if (selectedId && conversations.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? "");
  }, [conversations, visible, selectedId]);

  async function setStatus(status: Conversation["status"]) {
    if (!selected) return;
    setUpdating(true);
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selected.id}/status?conversation_status=${status}`, { method: "PATCH" });
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, status } : item));
    } finally {
      setUpdating(false);
    }
  }

  async function deleteConversation() {
    if (!selected) return;
    const id = selected.id;
    const remaining = conversations.filter((item) => item.id !== id);
    setConversations(remaining);
    setSelectedId(remaining[0]?.id || "");
    setNotice("");
    try {
      await apiFetch(`/conversations/${id}`, { method: "DELETE" });
    } catch {
      setNotice("Could not delete on the server. Start the API to persist changes.");
    }
  }

  function sendHumanReply() {
    if (!reply.trim() || !selected) return;
    setConversations((items) => items.map((item) => item.id === selected.id ? {
      ...item,
      messages: [...item.messages, {
        id: `local-${Date.now()}`,
        sender_type: "human",
        sender_name: "Support Manager",
        body: reply.trim(),
        citations: [],
        created_at: new Date().toISOString(),
      }],
    } : item));
    setReply("");
    setNotice("Reply added locally. Connect your channel send endpoint before production.");
  }

  return (
    <div className="flex min-h-[calc(100vh-128px)] flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/95">
      <aside className="hidden w-[330px] shrink-0 border-r border-gray-200 lg:flex lg:flex-col dark:border-gray-800">
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">Support inbox</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Email and website chat</p>
            </div>
            <Badge size="sm" color="warning">{needsHumanCount} need you</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 rounded-lg bg-gray-100 p-1 dark:bg-white/5">
            {(["active", "needs_human", "closed"] as const).map((key) => (
              <button key={key} onClick={() => setFilter(key)} className={`rounded-lg px-2 py-1.5 text-xs font-medium ${filter === key ? "bg-white text-gray-800 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500"}`}>
                {key === "active" ? "Active" : key === "needs_human" ? "Needs review" : "Closed"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!visible.length && <p className="px-4 py-10 text-center text-sm text-gray-500">{filter === "needs_human" ? "Nothing needs your review." : filter === "closed" ? "No resolved or closed tickets." : "No active tickets."}</p>}
          {visible.map((conversation) => {
            const active = conversation.id === selected?.id;
            return (
              <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-gray-100 px-4 py-4 text-left transition-colors dark:border-gray-800 ${active ? "bg-brand-25 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"}`}>
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{initials(conversation.customer_name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{conversation.customer_name}</p>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{relativeTime(conversation.updated_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300">{conversation.subject}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge size="sm" color={badgeFor(conversation).color}>{badgeFor(conversation).label}</Badge>
                        <span className="font-mono text-[10px] text-gray-400">{ticketRef(conversation)}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">{conversation.channel === "email" ? <MailIcon className="size-3.5" /> : <ChatIcon className="size-3.5" />}{conversation.channel}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {selected ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">{selected.subject}</h2>
                <Badge size="sm" color={badgeFor(selected).color}>{badgeFor(selected).label}</Badge>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400"><span className="font-mono text-gray-600 dark:text-gray-300">{ticketRef(selected)}</span> · {selected.customer_name} · {selected.customer_email} · Assigned to {selected.assigned_to}</p>
            </div>
            <div className="flex items-center gap-2">
              {selected.status !== "human_active" && <Button size="sm" variant="outline" loading={updating} onClick={() => setStatus("human_active")} startIcon={<UserCircleIcon className="size-4" />}>Take over</Button>}
              <button onClick={deleteConversation} aria-label="Delete conversation" title="Delete conversation" className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-error-200 hover:bg-error-50 hover:text-error-600 dark:border-gray-800 dark:hover:border-error-500/30 dark:hover:bg-error-500/10"><TrashBinIcon className="size-4" /></button>
            </div>
          </header>

          <div className="flex flex-1 flex-col xl:flex-row">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto bg-gray-25 p-4 dark:bg-gray-950/40 md:p-6">
                {selected.messages.map((message) => {
                  const isMike = message.sender_type === "agent";
                  const isHuman = message.sender_type === "human";
                  return (
                    <article key={message.id} className={`flex gap-3 ${message.sender_type === "customer" ? "" : "flex-row-reverse"}`}>
                      {isMike ? <AgentAvatar name="Mike" size="sm" showStatus /> : (
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${isHuman ? "bg-brand-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>{isHuman ? "HM" : initials(message.sender_name)}</span>
                      )}
                      <div className={`max-w-[78%] ${message.sender_type === "customer" ? "" : "text-right"}`}>
                        <div className="mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{message.sender_name}</span>
                          {isMike && <Badge size="sm" color="info">AI</Badge>}
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 text-left text-sm leading-6 ${message.sender_type === "customer" ? "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200" : isHuman ? "border-brand-500 bg-brand-500 text-white" : "border-blue-light-100 bg-blue-light-50 text-gray-800 dark:border-blue-light-500/20 dark:bg-blue-light-500/10 dark:text-gray-200"}`}>
                          {isMike ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                          {message.citations.length > 0 && (
                            <div className="mt-3 border-t border-current/10 pt-2">
                              {message.citations.map((citation) => <span key={citation.concept_id} className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-blue-light-700 dark:text-blue-light-300"><DocsIcon className="size-3.5" />{citation.title}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 p-4 dark:border-gray-800 md:p-5">
                {notice && <p className="mb-2 text-xs text-warning-700 dark:text-warning-400">{notice}</p>}
                <div className="flex items-end gap-3 rounded-xl border border-gray-300 bg-white p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder={selected.status === "human_active" ? "Reply as Support Manager…" : "Take over to reply as a human…"} disabled={selected.status !== "human_active"} className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/90" />
                  <button onClick={sendHumanReply} disabled={selected.status !== "human_active" || !reply.trim()} aria-label="Send reply" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"><PaperPlaneIcon className="size-4" /></button>
                </div>
              </div>
            </div>

            <aside className="hidden w-[280px] shrink-0 border-l border-gray-200 p-5 xl:block dark:border-gray-800">
              <div className="mb-5 border-b border-gray-100 pb-5 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-gray-800 dark:text-white/90">{ticketRef(selected)}</span>
                  <Badge size="sm" color={badgeFor(selected).color}>{badgeFor(selected).label}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.status !== "resolved" && selected.status !== "closed" && (
                    <Button size="sm" variant="outline" disabled={updating} onClick={() => setStatus("resolved")} startIcon={<CheckCircleIcon className="size-4" />}>Resolve</Button>
                  )}
                  {selected.status !== "closed" && (
                    <Button size="sm" variant="outline" disabled={updating} onClick={() => setStatus("closed")}>Close</Button>
                  )}
                  {(selected.status === "resolved" || selected.status === "closed") && (
                    <Button size="sm" variant="outline" disabled={updating} onClick={() => setStatus("open")}>Reopen</Button>
                  )}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Mike’s decision</h3>
              <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
                <div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-800"><div className={`h-1.5 rounded-full ${(selected.confidence || 0) < .7 ? "bg-warning-500" : "bg-success-500"}`} style={{ width: `${Math.round((selected.confidence || 0) * 100)}%` }} /></div><span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{Math.round((selected.confidence || 0) * 100)}%</span></div>
              </div>
              <dl className="mt-5 space-y-4 text-sm">
                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Reason</dt><dd className="mt-1 text-gray-700 dark:text-gray-300">{selected.summary}</dd></div>
                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Channel</dt><dd className="mt-1 capitalize text-gray-700 dark:text-gray-300">{selected.channel}</dd></div>
                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Priority</dt><dd className="mt-1 capitalize text-gray-700 dark:text-gray-300">{selected.priority}</dd></div>
              </dl>
            </aside>
          </div>
        </main>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">No conversations in this view.</div>
      )}
    </div>
  );
}

