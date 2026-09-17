"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Markdown from "@/components/worker/Markdown";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  ArrowUpIcon,
  CheckLineIcon,
  ChevronLeftIcon,
  DocsIcon,
  FilterLinesIcon,
  MoreDotIcon,
} from "@/icons";
import { apiFetch, Conversation, WorkerProfile } from "@/lib/worker-api";
import { useEffect, useMemo, useState } from "react";

const REPLY_MAX_LENGTH = 4000;
const CHANNEL_LABEL: Record<Conversation["channel"], string> = {
  chat: "Chat",
  widget: "Widget",
  email: "Email",
  // Inbox's own query already excludes assistant conversations; this label
  // only matters if that filter is ever bypassed (e.g. a future debug view).
  assistant: "Assistant",
};

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

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function lastMessagePreview(conversation: Conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last) return conversation.subject ?? "No messages yet";
  return last.senderType === "manager" ? `You: ${last.body}` : last.body;
}

const ACTIVE_HIDDEN = new Set(["resolved", "closed"]);

function FilterRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
        active
          ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      <span className={`flex size-4 shrink-0 items-center justify-center ${active ? "" : "opacity-0"}`}>
        <CheckLineIcon className="size-3.5" />
      </span>
      {label}
    </button>
  );
}

export default function WorkerInbox() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"active" | "needs_human" | "closed">("active");
  const [channelFilter, setChannelFilter] = useState<"all" | "widget" | "email">("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [updating, setUpdating] = useState(false);
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
    apiFetch<Conversation[]>("/conversations")
      .then((data) => setConversations(data))
      .catch(() => undefined);
  }, []);

  const ticketRef = (conversation: Conversation) =>
    `${profile?.ticketPrefix ?? "TCK"}-${conversation.ticketNumber}`;

  const needsHumanCount = useMemo(
    () => conversations.filter((item) => item.status === "needs_human").length,
    [conversations],
  );

  const visible = useMemo(() => {
    const byStatus =
      filter === "needs_human"
        ? conversations.filter((item) => item.status === "needs_human")
        : filter === "closed"
          ? conversations.filter((item) => ACTIVE_HIDDEN.has(item.status))
          : conversations.filter((item) => !ACTIVE_HIDDEN.has(item.status));
    const byChannel = channelFilter === "all" ? byStatus : byStatus.filter((item) => item.channel === channelFilter);
    const query = search.trim().toLowerCase();
    if (!query) return byChannel;
    return byChannel.filter((item) => {
      return (
        item.customerName.toLowerCase().includes(query) ||
        ticketRef(item).toLowerCase().includes(query) ||
        (item.subject ?? "").toLowerCase().includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, filter, channelFilter, search]);
  const selected = conversations.find((item) => item.id === selectedId);
  const filtersActive = filter !== "active" || channelFilter !== "all";

  useEffect(() => {
    if (selectedId && conversations.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? "");
  }, [conversations, visible, selectedId]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("thread");
  }

  async function setStatus(status: Conversation["status"]) {
    if (!selected) return;
    setKebabOpen(false);
    setUpdating(true);
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setConversations((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setNotice("Could not update status.");
    } finally {
      setUpdating(false);
    }
  }

  async function setHumanControlled(humanControlled: boolean) {
    if (!selected) return;
    setUpdating(true);
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ humanControlled }),
      });
      setConversations((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setNotice(humanControlled ? "Could not take over this conversation." : "Could not hand this conversation back.");
    } finally {
      setUpdating(false);
    }
  }

  async function deleteConversation() {
    if (!selected) return;
    const id = selected.id;
    setDeleteOpen(false);
    try {
      await apiFetch(`/conversations/${id}`, { method: "DELETE" });
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      setSelectedId(remaining[0]?.id || "");
      setMobileView("list");
    } catch {
      setNotice("Could not delete this conversation.");
    }
  }

  async function sendManagerReply() {
    if (!reply.trim() || !selected) return;
    const body = reply.trim();
    setUpdating(true);
    setNotice("");
    try {
      const result = await apiFetch<{ conversation: Conversation }>(`/conversations/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setConversations((items) => items.map((item) => (item.id === result.conversation.id ? result.conversation : item)));
      setReply("");
    } catch {
      setNotice("Could not send the reply. Check that the API is running and try again.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/95">
      <aside
        className={`w-full shrink-0 border-r border-gray-200 lg:flex lg:w-[340px] lg:min-h-0 lg:flex-col dark:border-gray-800 ${
          mobileView === "list" ? "flex flex-col" : "hidden"
        }`}
      >
        <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">Inbox</h1>
            <Badge size="sm" color="warning">
              {needsHumanCount} need you
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="fill-gray-400 dark:fill-gray-500">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                  />
                </svg>
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, ticket, or ID"
                className="h-9 w-full rounded-lg border border-gray-200 bg-transparent pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setFilterOpen((open) => !open)}
                aria-label="Filter conversations"
                className={`dropdown-toggle relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  filterOpen
                    ? "border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-800 dark:bg-brand-500/10"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                <FilterLinesIcon className="size-4" />
                {filtersActive && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-white bg-brand-500 dark:border-gray-900" />
                )}
              </button>
              <Dropdown isOpen={filterOpen} onClose={() => setFilterOpen(false)} className="w-56 p-3">
                <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Status
                </p>
                <div className="flex flex-col gap-0.5">
                  <FilterRow label="Active" active={filter === "active"} onClick={() => setFilter("active")} />
                  <FilterRow label="Needs review" active={filter === "needs_human"} onClick={() => setFilter("needs_human")} />
                  <FilterRow label="Closed" active={filter === "closed"} onClick={() => setFilter("closed")} />
                </div>
                <p className="mt-3 px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Channel
                </p>
                <div className="flex flex-col gap-0.5">
                  <FilterRow label="All channels" active={channelFilter === "all"} onClick={() => setChannelFilter("all")} />
                  <FilterRow label="Widget" active={channelFilter === "widget"} onClick={() => setChannelFilter("widget")} />
                  <FilterRow label="Email" active={channelFilter === "email"} onClick={() => setChannelFilter("email")} />
                </div>
                {filtersActive && (
                  <button
                    onClick={() => {
                      setFilter("active");
                      setChannelFilter("all");
                    }}
                    className="mt-3 w-full border-t border-gray-100 pt-2.5 text-center text-xs font-medium text-gray-500 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear filters
                  </button>
                )}
              </Dropdown>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!visible.length && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              {search.trim()
                ? "No conversations match your search."
                : filter === "needs_human"
                  ? "Nothing needs your review."
                  : filter === "closed"
                    ? "No resolved or closed tickets."
                    : "No active tickets."}
            </p>
          )}
          {visible.map((conversation) => {
            const active = conversation.id === selected?.id;
            return (
              <button
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors dark:border-gray-800 ${
                  active ? "bg-brand-25 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex shrink-0">
                    <span className="flex size-10 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {initials(conversation.customerName)}
                    </span>
                    {conversation.status === "needs_human" && (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-warning-500 dark:border-gray-900" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{conversation.customerName}</p>
                      <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{relativeTime(conversation.updatedAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{lastMessagePreview(conversation)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {selected ? (
        <main
          className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${mobileView === "thread" ? "flex" : "hidden"}`}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileView("list")}
                aria-label="Back to conversations"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden dark:text-gray-400 dark:hover:bg-white/5"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {initials(selected.customerName)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{selected.customerName}</p>
                  <Badge size="sm" color={badgeFor(selected).color}>
                    {badgeFor(selected).label}
                  </Badge>
                  {selected.humanControlled && (
                    <Badge size="sm" color="primary">
                      Human-controlled
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {CHANNEL_LABEL[selected.channel]} &middot; <span className="font-mono">{ticketRef(selected)}</span>
                  {selected.subject ? <> &middot; {selected.subject}</> : null}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selected.humanControlled ? (
                <Button size="sm" variant="outline" disabled={updating} onClick={() => setHumanControlled(false)}>
                  Hand back to AI
                </Button>
              ) : (
                <Button size="sm" disabled={updating} onClick={() => setHumanControlled(true)}>
                  Take over
                </Button>
              )}
              <div className="relative">
                <button
                  onClick={() => setKebabOpen((open) => !open)}
                  aria-label="More actions"
                  className="dropdown-toggle flex size-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  <MoreDotIcon className="size-4" />
                </button>
                <Dropdown isOpen={kebabOpen} onClose={() => setKebabOpen(false)} className="w-52 p-1.5">
                  {selected.status !== "resolved" && selected.status !== "closed" && (
                    <DropdownItem onClick={() => setStatus("resolved")} className="rounded-lg">
                      Resolve
                    </DropdownItem>
                  )}
                  {selected.status !== "closed" && (
                    <DropdownItem onClick={() => setStatus("closed")} className="rounded-lg">
                      Close
                    </DropdownItem>
                  )}
                  {(selected.status === "resolved" || selected.status === "closed") && (
                    <DropdownItem onClick={() => setStatus("open")} className="rounded-lg">
                      Reopen
                    </DropdownItem>
                  )}
                  <DropdownItem
                    onClick={() => {
                      setKebabOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
                  >
                    Delete conversation
                  </DropdownItem>
                </Dropdown>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gray-25 p-4 [scrollbar-gutter:stable] dark:bg-gray-950/40 md:p-6">
              {selected.messages.map((message) => {
                const isAgent = message.senderType === "agent";
                const isManager = message.senderType === "manager";
                const outgoing = message.senderType !== "customer";
                return (
                  <article key={message.id} className={`flex gap-3 ${outgoing ? "flex-row-reverse" : ""}`}>
                    {isAgent ? (
                      <AgentAvatar
                        initials={profile?.avatarInitials ?? "AW"}
                        size="sm"
                        accentColor={profile?.accentColor}
                        avatarUrl={profile?.avatarUrl}
                      />
                    ) : (
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isManager ? "bg-brand-500 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {isManager ? "MG" : initials(message.senderName)}
                      </span>
                    )}
                    <div className={`max-w-[78%] ${outgoing ? "text-right" : ""}`}>
                      <div className={`mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${outgoing ? "justify-end" : ""}`}>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{message.senderName}</span>
                        {isAgent && (
                          <Badge size="sm" color="info">
                            AI
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`px-4 py-3 text-left text-sm leading-6 ${
                          outgoing ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md border"
                        } ${
                          message.senderType === "customer"
                            ? "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
                            : isManager
                              ? "bg-brand-500 text-white"
                              : "bg-blue-light-50 text-gray-800 dark:bg-blue-light-500/10 dark:text-gray-200"
                        }`}
                      >
                        {isAgent ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                        {message.citations.length > 0 && (
                          <div className="mt-3 border-t border-current/10 pt-2">
                            {message.citations.map((citation) => (
                              <span key={citation} className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-blue-light-700 dark:text-blue-light-300">
                                <DocsIcon className="size-3.5" />
                                {citation}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-800 md:p-5">
              {notice && <p className="mb-2 text-xs text-warning-700 dark:text-warning-400">{notice}</p>}
              <div className="flex items-end gap-3 rounded-xl border border-gray-300 bg-white p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                <AutoGrowTextarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  minRows={2}
                  maxRows={8}
                  maxLength={REPLY_MAX_LENGTH}
                  placeholder="Reply as the manager…"
                  className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
                />
                <button
                  onClick={sendManagerReply}
                  disabled={!reply.trim() || updating}
                  aria-label="Send reply"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
              </div>
              {reply.length > REPLY_MAX_LENGTH * 0.9 && (
                <p className="mt-1 text-right text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {reply.length}/{REPLY_MAX_LENGTH}
                </p>
              )}
            </div>
          </div>
        </main>
      ) : (
        <div className="hidden flex-1 items-center justify-center text-sm text-gray-500 lg:flex">No conversations in this view.</div>
      )}

      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        ariaLabel="Delete conversation"
        className="m-4 w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Delete this conversation?</h2>
        <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">This can&apos;t be undone.</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <button
            onClick={deleteConversation}
            className="box-border inline-flex h-7 shrink-0 items-center justify-center rounded-lg bg-error-500 px-2.5 text-xs font-semibold leading-none text-white transition-colors duration-150 ease-out hover:bg-error-600 active:bg-error-700"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
