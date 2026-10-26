"use client";

import CustomerFileChips from "@/components/worker/CustomerFileChips";
import WhyThisReply from "@/components/worker/WhyThisReply";
import { SHOW_REPLY_TRACE } from "@/lib/reply-trace";
import AnswerFeedbackControls from "@/components/worker/AnswerFeedbackControls";
import AgentAvatar from "@/components/aix/AgentAvatar";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import InboxApprovals from "@/components/worker/InboxApprovals";
import Markdown from "@/components/worker/Markdown";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  AlertIcon,
  ArrowUpIcon,
  ChatIcon,
  CheckLineIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DocsIcon,
  FilterLinesIcon,
  MailIcon,
  MoreDotIcon,
} from "@/icons";
import {
  CONVERSATION_READ_EVENT,
  isConversationUnread,
  loadConversationReadMap,
  markConversationRead,
  type ConversationReadMap,
} from "@/lib/conversation-read-state";
import { customerLabel, isPlaceholderName } from "@/lib/tickets";
import { apiFetch, Conversation, WorkerApiError, WorkerProfile } from "@/lib/worker-api";
import { useEffect, useMemo, useRef, useState } from "react";

const REPLY_MAX_LENGTH = 4000;
const CHANNEL_LABEL: Record<Conversation["channel"], string> = {
  chat: "Chat",
  widget: "Chat widget",
  email: "Email",
  // Inbox's own query already excludes assistant conversations; this label
  // only matters if that filter is ever bypassed (e.g. a future debug view).
  assistant: "Assistant",
};

type StatusFilter = "all" | "needs_human" | "agent" | "closed";
type ChannelFilter = "all" | "widget" | "email";

const CLOSED_STATUSES = new Set(["resolved", "closed"]);

function matchesStatus(conversation: Conversation, filter: StatusFilter) {
  switch (filter) {
    case "needs_human":
      return conversation.status === "needs_human";
    case "agent":
      return conversation.status === "open" && !conversation.humanControlled;
    case "closed":
      return CLOSED_STATUSES.has(conversation.status);
    default:
      return !CLOSED_STATUSES.has(conversation.status);
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function messageTime(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

// The backend names a conversation "Website visitor" or "Visitor 4821" until the customer says who they are.
function initials(name: string) {
  // An anonymous visitor has no initials to show.
  if (isPlaceholderName(name)) return "#";
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function lastMessagePreview(conversation: Conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last) return conversation.subject ?? "No messages yet";
  if (last.senderType === "manager") return `You: ${last.body}`;
  if (last.senderType === "agent") return `${last.senderName}: ${last.body}`;
  return last.body;
}

/** The one status chip a row or thread shows, if any. */
/**
 * One plain sentence for why a Jira ticket wasn't raised. The raw error stays
 * one click away under Details, for whoever has to fix it.
 */
function ticketErrorReason(raw: string) {
  if (/no credits|insufficient_quota|billing/i.test(raw)) return "The AI provider is out of credits. Add credits to fix this.";
  if (/\b429\b|rate limit/i.test(raw)) return "The AI provider is busy. Try again in a few minutes.";
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|permission/i.test(raw)) return "Jira refused the request. Check the Jira connection in Settings.";
  if (/request type/i.test(raw)) return "No Jira request type could be picked for this conversation.";
  if (/jira site|connection/i.test(raw)) return "The Jira connection needs attention in Settings.";
  return "Something went wrong while talking to Jira.";
}

function TicketErrorNotice({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="group rounded-2xl border border-warning-200 bg-warning-25 text-sm dark:border-warning-500/25 dark:bg-warning-500/[0.08]">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <AlertIcon className="size-4 shrink-0 text-warning-600 dark:text-warning-400" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-gray-900 dark:text-white/90">Jira ticket wasn&rsquo;t created.</span>{" "}
          <span className="text-gray-600 dark:text-gray-300">{ticketErrorReason(error)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          Details
          <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex items-start gap-2 border-t border-warning-200 px-3.5 py-2.5 dark:border-warning-500/20">
        <p className="min-w-0 flex-1 break-words font-mono text-xs leading-5 text-gray-600 dark:text-gray-400">{error}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(error).then(() => setCopied(true));
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-900/[0.04] hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
        >
          <CopyIcon className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </details>
  );
}

function statusTag(conversation: Conversation): { label: string; tone: "warning" | "brand" | "muted" } | null {
  if (conversation.status === "needs_human") return { label: "Needs you", tone: "warning" };
  if (CLOSED_STATUSES.has(conversation.status)) {
    return { label: conversation.status === "resolved" ? "Resolved" : "Closed", tone: "muted" };
  }
  if (conversation.humanControlled) return { label: "You're handling", tone: "brand" };
  return null;
}

const TAG_TONE = {
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  warning: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  muted: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
};

/** How well the customer is known: only meaningful for chats, where anyone can type anything. */
function identityTag(conversation: Conversation): { label: string; tone: "success" | "muted" } | null {
  if (conversation.channel !== "widget" && conversation.channel !== "chat") return null;
  if (conversation.customerEmailVerifiedAt) return { label: "Verified", tone: "success" };
  if (conversation.customerEmail) return { label: "Email given", tone: "muted" };
  if (isPlaceholderName(conversation.customerName)) {
    return customerLabel(conversation).unverified ? { label: "Name given", tone: "muted" } : { label: "Anonymous", tone: "muted" };
  }
  return null;
}

function StatusTag({ conversation }: { conversation: Conversation }) {
  const tag = statusTag(conversation);
  const identity = identityTag(conversation);
  if (!tag && !identity) return null;
  return (
    <>
      {tag && (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-theme-xs font-medium ${TAG_TONE[tag.tone]}`}>
          {tag.label}
        </span>
      )}
      {identity && (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-theme-xs font-medium ${TAG_TONE[identity.tone]}`}>
          {identity.label}
        </span>
      )}
    </>
  );
}

function ChannelIcon({ channel, className }: { channel: Conversation["channel"]; className?: string }) {
  const Icon = channel === "email" ? MailIcon : ChatIcon;
  return <Icon className={className} aria-label={CHANNEL_LABEL[channel]} />;
}

/** Customer avatar: brand-orange ring around initials, matching Jules. */
function CustomerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "size-10 text-[13px]" : size === "sm" ? "size-8 text-[11px]" : "size-9 text-xs";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-500 font-medium text-brand-600 dark:text-brand-400 ${sizeClass}`}
    >
      {initials(name)}
    </span>
  );
}

function FilterOption({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-gray-100 font-medium text-gray-900 dark:bg-white/[0.06] dark:text-white"
          : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
      }`}
    >
      <span className={`flex size-4 shrink-0 items-center justify-center text-brand-500 ${active ? "" : "opacity-0"}`}>
        <CheckLineIcon className="size-3.5" />
      </span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{count}</span>}
    </button>
  );
}

const outlineControl =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white/60 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]";

export default function WorkerInbox() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [updating, setUpdating] = useState(false);
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");
  const [readMap, setReadMap] = useState<ConversationReadMap>({});

  useEffect(() => {
    setReadMap(loadConversationReadMap());
    const syncRead = () => setReadMap(loadConversationReadMap());
    window.addEventListener(CONVERSATION_READ_EVENT, syncRead);
    window.addEventListener("storage", syncRead);
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
    apiFetch<Conversation[]>("/conversations")
      .then((data) => {
        setConversations(data);
        // Opened from a link (e.g. a handoff email): /inbox?conversation=<id>
        // lands on that conversation, under whichever filter shows it.
        const wanted = new URLSearchParams(window.location.search).get("conversation");
        const hit = wanted ? data.find((item) => item.id === wanted) : undefined;
        if (hit) {
          setStatusFilter(
            hit.status === "needs_human" ? "needs_human" : CLOSED_STATUSES.has(hit.status) ? "closed" : "all",
          );
          setSelectedId(hit.id);
          setMobileView("thread");
        }
      })
      .catch(() => undefined);
    return () => {
      window.removeEventListener(CONVERSATION_READ_EVENT, syncRead);
      window.removeEventListener("storage", syncRead);
    };
  }, []);

  const agentName = profile?.displayName || "AI Worker";

  const ticketRef = (conversation: Conversation) =>
    `${profile?.ticketPrefix ?? "TCK"}-${conversation.ticketNumber}`;

  // Counts in the filter menu follow the channel filter, so each status shows
  // how many conversations picking it would actually list.
  const statusCounts = useMemo(() => {
    const inChannel =
      channelFilter === "all" ? conversations : conversations.filter((item) => item.channel === channelFilter);
    const count = (filter: StatusFilter) => inChannel.filter((item) => matchesStatus(item, filter)).length;
    return { all: count("all"), needs_human: count("needs_human"), agent: count("agent"), closed: count("closed") };
  }, [conversations, channelFilter]);

  const visible = useMemo(() => {
    const byStatus = conversations.filter((item) => matchesStatus(item, statusFilter));
    const byChannel = channelFilter === "all" ? byStatus : byStatus.filter((item) => item.channel === channelFilter);
    const query = search.trim().toLowerCase();
    if (!query) return byChannel;
    return byChannel.filter((item) => {
      return (
        item.customerName.toLowerCase().includes(query) ||
        customerLabel(item).name.toLowerCase().includes(query) ||
        (item.customerEmail ?? customerLabel(item).email ?? "").toLowerCase().includes(query) ||
        ticketRef(item).toLowerCase().includes(query) ||
        (item.subject ?? "").toLowerCase().includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, statusFilter, channelFilter, search]);
  const selected = conversations.find((item) => item.id === selectedId);
  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) + (channelFilter !== "all" ? 1 : 0);
  const isClosed = selected ? CLOSED_STATUSES.has(selected.status) : false;

  useEffect(() => {
    if (selectedId && conversations.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? "");
  }, [conversations, visible, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const conversation = conversations.find((item) => item.id === selectedId);
    if (!conversation) return;

    // Persist outside a state updater: markConversationRead broadcasts an event
    // that NotificationDropdown handles with its own setState, which React
    // rejects if it fires mid-render.
    const mark = () => setReadMap(markConversationRead(conversation, loadConversationReadMap()));

    // Mobile keeps the list up until the manager opens a thread.
    if (mobileView === "thread") {
      mark();
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      mark();
    }
  }, [selectedId, conversations, mobileView]);

  // Open each thread at its newest message, and follow new replies.
  const threadRef = useRef<HTMLDivElement>(null);
  const messageCount = selected?.messages.length ?? 0;
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [selectedId, messageCount, mobileView]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("thread");
    setNotice("");
  }

  function replaceConversation(updated: Conversation) {
    setConversations((items) => items.map((item) => (item.id === updated.id ? updated : item)));
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
      replaceConversation(updated);
    } catch {
      setNotice("Could not update status.");
    } finally {
      setUpdating(false);
    }
  }

  /** For a customer who could not finish the emailed code: the manager raises the helpdesk ticket from what was typed. */
  async function raiseTicket() {
    if (!selected) return;
    setKebabOpen(false);
    setUpdating(true);
    try {
      const result = await apiFetch<{ key: string }>(`/conversations/${selected.id}/raise-ticket`, { method: "POST" });
      replaceConversation({ ...selected, externalTicketKey: result.key, status: "needs_human" });
      setNotice(`Raised ${result.key}. The details are what the customer typed, not verified.`);
    } catch (error) {
      setNotice(error instanceof WorkerApiError ? error.message : "Could not raise the ticket.");
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
      replaceConversation(updated);
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

  // Replying takes over: the agent stops answering this conversation before
  // the manager's message lands, so the two never talk over each other.
  async function sendManagerReply() {
    if (!reply.trim() || !selected) return;
    const body = reply.trim();
    setUpdating(true);
    setNotice("");
    try {
      if (!selected.humanControlled) {
        await apiFetch<Conversation>(`/conversations/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ humanControlled: true }),
        });
      }
      const result = await apiFetch<{ conversation: Conversation }>(`/conversations/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      replaceConversation(result.conversation);
      setReply("");
    } catch (error) {
      // An email that couldn't be sent says why (no mailbox, a blocked domain).
      setNotice(error instanceof WorkerApiError ? error.message : "Could not send the reply. Try again.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header
        className={`shrink-0 flex-wrap items-start justify-between gap-4 pb-4 lg:flex ${
          mobileView === "thread" ? "hidden" : "flex"
        }`}
      >
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900 dark:text-white/90">Inbox</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Conversations {agentName} is handling across chat and email.
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setFilterOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            className={`dropdown-toggle ${outlineControl} px-3 ${
              filterOpen || activeFilterCount ? "!border-brand-500 dark:!border-brand-500" : ""
            }`}
          >
            <FilterLinesIcon className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] rounded-full bg-brand-500 px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon className="size-3.5" />
          </button>
          <Dropdown isOpen={filterOpen} onClose={() => setFilterOpen(false)} className="w-64 p-2 shadow-theme-lg">
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">Status</p>
            <div className="flex flex-col gap-0.5">
              <FilterOption label="All open" count={statusCounts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
              <FilterOption label="Needs you" count={statusCounts.needs_human} active={statusFilter === "needs_human"} onClick={() => setStatusFilter("needs_human")} />
              <FilterOption label={`${agentName} handling`} count={statusCounts.agent} active={statusFilter === "agent"} onClick={() => setStatusFilter("agent")} />
              <FilterOption label="Closed" count={statusCounts.closed} active={statusFilter === "closed"} onClick={() => setStatusFilter("closed")} />
            </div>
            <div className="mx-1 my-1.5 h-px bg-gray-100 dark:bg-white/[0.08]" />
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">Channel</p>
            <div className="flex flex-col gap-0.5">
              <FilterOption label="All channels" active={channelFilter === "all"} onClick={() => setChannelFilter("all")} />
              <FilterOption label="Chat widget" active={channelFilter === "widget"} onClick={() => setChannelFilter("widget")} />
              <FilterOption label="Email" active={channelFilter === "email"} onClick={() => setChannelFilter("email")} />
            </div>
            {activeFilterCount > 0 && (
              <>
                <div className="mx-1 my-1.5 h-px bg-gray-100 dark:bg-white/[0.08]" />
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setChannelFilter("all");
                  }}
                  className="w-full rounded-lg py-2 text-center text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear filters
                </button>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      <div
        className={`flex min-h-0 flex-1 overflow-hidden border-gray-200 lg:border-t dark:border-white/[0.08] ${
          mobileView === "list" ? "border-t" : ""
        }`}
      >
        <aside
          className={`w-full shrink-0 border-r border-gray-200 lg:flex lg:w-[360px] lg:min-h-0 lg:flex-col dark:border-white/[0.08] ${
            mobileView === "list" ? "flex flex-col" : "hidden"
          }`}
        >
          <div className="shrink-0 border-b border-gray-200 py-2.5 lg:pr-3 dark:border-white/[0.08]">
            <label className="relative flex items-center">
              <span className="pointer-events-none absolute left-3">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="fill-gray-400 dark:fill-gray-500" aria-hidden="true">
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
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white/60 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white/90"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!visible.length && (
              <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {search.trim()
                  ? "No conversations match your search."
                  : activeFilterCount
                    ? "No conversations match these filters."
                    : "No open conversations."}
              </p>
            )}
            {visible.map((conversation) => {
              const active = conversation.id === selected?.id;
              const unread = isConversationUnread(conversation, readMap);
              return (
                <button
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  aria-label={unread ? `${customerLabel(conversation).name}, unread` : customerLabel(conversation).name}
                  aria-current={active ? "true" : undefined}
                  className={`relative flex w-full items-start gap-3 border-b border-gray-100 py-3 pl-4 pr-3 text-left transition-colors dark:border-white/[0.06] ${
                    active
                      ? "bg-brand-500/[0.08] dark:bg-brand-500/[0.12]"
                      : "hover:bg-gray-900/[0.03] dark:hover:bg-white/[0.03]"
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand-500" />}
                  <CustomerAvatar name={customerLabel(conversation).name} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {unread && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand-500" />}
                        <span
                          className={`truncate text-sm ${unread || active ? "font-semibold" : "font-medium"} ${
                            active ? "text-brand-600 dark:text-brand-400" : "text-gray-900 dark:text-white/90"
                          }`}
                        >
                          {customerLabel(conversation).name}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-xs ${
                          unread ? "font-semibold text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {relativeTime(conversation.updatedAt)}
                      </span>
                    </span>
                    <span
                      className={`truncate text-sm ${
                        unread ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {lastMessagePreview(conversation)}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-gray-400 dark:text-gray-500">
                      <ChannelIcon channel={conversation.channel} className="size-3.5" />
                      <StatusTag conversation={conversation} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selected ? (
          <main className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${mobileView === "thread" ? "flex" : "hidden"}`}>
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 py-3 lg:pl-6 dark:border-white/[0.08]">
              <div className="flex min-w-0 items-center gap-3.5">
                <button
                  onClick={() => setMobileView("list")}
                  aria-label="Back to conversations"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-900/[0.04] lg:hidden dark:text-gray-400 dark:hover:bg-white/5"
                >
                  <ChevronLeftIcon className="size-5" />
                </button>
                <CustomerAvatar name={customerLabel(selected).name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white/90">{customerLabel(selected).name}</p>
                    <StatusTag conversation={selected} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {[customerLabel(selected).email, CHANNEL_LABEL[selected.channel]].filter(Boolean).join(" · ")}
                    {selected.externalTicketKey ? (
                      <>
                        {" "}
                        &middot; Jira <span className="font-mono">{selected.externalTicketKey}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!selected.externalTicketKey && !isClosed && selected.status === "needs_human" ? (
                  <button disabled={updating} onClick={raiseTicket} className={`${outlineControl} px-3`} title="Raise the helpdesk ticket from what the customer typed (not verified by an emailed code)">
                    Raise ticket
                  </button>
                ) : null}
                {selected.humanControlled && !isClosed ? (
                  <button disabled={updating} onClick={() => setHumanControlled(false)} className={`${outlineControl} px-3`}>
                    Hand back to {agentName}
                  </button>
                ) : isClosed ? (
                  <button disabled={updating} onClick={() => setStatus("open")} className={`${outlineControl} px-3`}>
                    Reopen
                  </button>
                ) : (
                  <button disabled={updating} onClick={() => setStatus("closed")} className={`${outlineControl} px-3`}>
                    <CheckLineIcon className="size-4" />
                    Close conversation
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={() => setKebabOpen((open) => !open)}
                    aria-label="More actions"
                    className={`dropdown-toggle ${outlineControl} w-9`}
                  >
                    <MoreDotIcon className="size-4" />
                  </button>
                  <Dropdown isOpen={kebabOpen} onClose={() => setKebabOpen(false)} className="w-52 p-1.5 shadow-theme-lg">
                    {!selected.humanControlled && !isClosed && (
                      <DropdownItem
                        onClick={() => {
                          setKebabOpen(false);
                          setHumanControlled(true);
                        }}
                        className="rounded-lg"
                      >
                        Take over
                      </DropdownItem>
                    )}
                    {selected.status !== "resolved" && (
                      <DropdownItem onClick={() => setStatus("resolved")} className="rounded-lg">
                        Mark resolved
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
              <div ref={threadRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-5 [scrollbar-gutter:stable] lg:pl-6 lg:pr-2">
                {selected.externalTicketError && (
                  <TicketErrorNotice key={selected.id} error={selected.externalTicketError} />
                )}

                {selected.summary && (
                  <div className="rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-sm leading-6 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300">
                    <p className="mb-1 font-semibold text-gray-900 dark:text-white/90">Summary</p>
                    {selected.summary}
                  </div>
                )}

                {selected.messages.map((message) => {
                  if (message.senderType === "customer") {
                    return (
                      <article key={message.id} className="flex gap-3 pr-8 md:pr-16">
                        <span className="mt-6">
                          <CustomerAvatar name={message.senderName} size="sm" />
                        </span>
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="text-[13px] font-medium text-gray-900 dark:text-white/90">{message.senderName}</span>
                            {messageTime(message.createdAt)}
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-gray-800 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200">
                            <p className="whitespace-pre-wrap">{message.body}</p>
                            {message.customerFiles && message.customerFiles.length > 0 && <CustomerFileChips files={message.customerFiles} />}
                          </div>
                        </div>
                      </article>
                    );
                  }

                  const isAgent = message.senderType === "agent";
                  return (
                    <article key={message.id} className="flex justify-end gap-3 pl-8 md:pl-16">
                      <div className="flex min-w-0 flex-col items-end">
                        <div className="mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          {messageTime(message.createdAt)}
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                            {isAgent ? "AI" : "You"}
                          </span>
                          <span className="text-[13px] font-medium text-gray-900 dark:text-white/90">{message.senderName}</span>
                        </div>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 ${
                            isAgent
                              ? "bg-brand-500 text-white"
                              : "border border-brand-200 bg-brand-50 text-gray-800 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-white/90"
                          }`}
                        >
                          {isAgent ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap">{message.body}</p>}
                          {message.citations.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {message.citations.map((citation, index) => {
                                const label = typeof citation === "string" ? citation : (citation as { title?: string })?.title ?? "Source";
                                return (
                                  <span
                                    key={`${message.id}-${index}-${label}`}
                                    className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white"
                                  >
                                    <DocsIcon className="size-3.5" />
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {SHOW_REPLY_TRACE && isAgent && !message.cards?.some((card) => card.kind === "helpdesk_ticket") && (
                          <AnswerFeedbackControls
                            messageId={message.id}
                            ratings={(selected.feedback ?? []).filter((entry) => entry.messageId === message.id)}
                            onChange={(next) =>
                              replaceConversation({
                                ...selected,
                                feedback: [
                                  ...(selected.feedback ?? []).filter((entry) => !(entry.messageId === message.id && entry.mine)),
                                  ...(next ? [next] : []),
                                ],
                              })
                            }
                          />
                        )}
                        {isAgent && !message.cards?.some((card) => card.kind === "helpdesk_ticket") && <WhyThisReply messageId={message.id} body={message.body} />}
                      </div>
                      <span className="mt-6 shrink-0">
                        {isAgent ? (
                          <AgentAvatar
                            initials={profile?.avatarInitials ?? "AW"}
                            size="sm"
                            accentColor={profile?.accentColor}
                            avatarUrl={profile?.avatarUrl}
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-full bg-gray-800 text-[11px] font-semibold text-white dark:bg-white/[0.12]">
                            {initials(message.senderName)}
                          </span>
                        )}
                      </span>
                    </article>
                  );
                })}

                {selected.status === "needs_human" && (
                  <div className="flex items-center gap-3 text-xs text-warning-700 dark:text-warning-400">
                    <span className="h-px flex-1 bg-gray-200 dark:bg-white/[0.08]" />
                    <span className="flex items-center gap-1.5">
                      <AlertIcon className="size-3.5" />
                      {agentName} asked for your help
                    </span>
                    <span className="h-px flex-1 bg-gray-200 dark:bg-white/[0.08]" />
                  </div>
                )}

                <InboxApprovals key={selected.id} conversationId={selected.id} refreshKey={selected.messages.length} />
              </div>

              <div className="shrink-0 pb-1 pt-2 lg:pl-6 lg:pr-2">
                {notice && <p className="mb-2 text-xs text-warning-700 dark:text-warning-400">{notice}</p>}
                {isClosed ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">
                    This conversation is closed.
                    <Button size="sm" variant="outline" disabled={updating} onClick={() => setStatus("open")}>
                      Reopen
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 dark:border-white/[0.12] dark:bg-white/[0.03]">
                    <AutoGrowTextarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      minRows={2}
                      maxRows={8}
                      maxLength={REPLY_MAX_LENGTH}
                      aria-label="Reply"
                      placeholder={isPlaceholderName(customerLabel(selected).name) ? "Write a reply…" : `Reply to ${customerLabel(selected).name.split(" ")[0]}…`}
                      className="block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 py-2 pl-3.5 pr-2 dark:border-white/[0.08]">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {selected.humanControlled
                          ? `You're handling this. ${agentName} won't reply until you hand it back.`
                          : `Sending a reply takes over from ${agentName}.`}
                        {reply.length > REPLY_MAX_LENGTH * 0.9 && (
                          <span className="ml-2 tabular-nums">
                            {reply.length}/{REPLY_MAX_LENGTH}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={sendManagerReply}
                        disabled={!reply.trim() || updating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(244,121,32,0.25)] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none dark:disabled:bg-brand-500/40"
                      >
                        Send
                        <ArrowUpIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-sm text-gray-500 lg:flex dark:text-gray-400">
            Select a conversation to read it.
          </div>
        )}
      </div>

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
