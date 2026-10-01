"use client";

import Badge from "@/components/ui/badge/Badge";
import AssistantPanel from "@/components/worker/AssistantPanel";
import Markdown from "@/components/worker/Markdown";
import { CheckLineIcon, CopyIcon } from "@/icons";
import type {
  AuditFinding,
  ConfigAuditCard,
  ConfigCard,
  DraftCard,
  KnowledgeListCard,
  KnowledgeResultsCard,
  PanelCard,
  TicketCard,
  TicketListCard,
  TicketSummary,
} from "@/lib/assistant-cards";
import type { AssistantPanelAction, AssistantPanelItem } from "@/lib/worker-api";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * The cards an admin Assistant reply can show (see lib/assistant-cards.ts).
 * Each is plain props-in UI; CopilotKit hands it the card's data through the
 * renderers in ./renderers.tsx. Panels need the chat's own state (busy,
 * refresh, what a button sends), which comes from AssistantCardsContext.
 */

export type AssistantCardsContextValue = {
  busy: boolean;
  panelRefresh: number;
  onPanelAction: (action: AssistantPanelAction, item: AssistantPanelItem) => void;
};

export const AssistantCardsContext = createContext<AssistantCardsContextValue>({
  busy: false,
  panelRefresh: 0,
  onPanelAction: () => undefined,
});

const STATUS: Record<string, { label: string; color: "info" | "success" | "warning" | "light" }> = {
  open: { label: "Open", color: "info" },
  needs_human: { label: "Needs review", color: "warning" },
  resolved: { label: "Resolved", color: "success" },
  closed: { label: "Closed", color: "light" },
};

const CHANNEL_LABEL: Record<string, string> = { email: "Email", widget: "Website", chat: "Chat" };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function inboxHref(conversationId: string): string {
  return `/inbox?conversation=${encodeURIComponent(conversationId)}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function CardShell({
  title,
  meta,
  action,
  children,
  label,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          {meta && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{meta}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
      {children}
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}

function ShowAll({ total, shown, onClick }: { total: number; shown: number; onClick: () => void }) {
  if (total <= shown) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-t border-gray-100 px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04]"
    >
      Show all {total.toLocaleString()}
    </button>
  );
}

export function CardSkeleton() {
  return <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />;
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS[status] ?? { label: status, color: "light" as const };
  return (
    <Badge size="sm" color={info.color}>
      {info.label}
    </Badge>
  );
}

function ticketListTitle(filter: TicketListCard["filter"]): string {
  const base =
    filter.status === "active"
      ? "Conversations in progress"
      : filter.status === "needs_human"
        ? "Waiting for you"
        : filter.status
          ? `${STATUS[filter.status]?.label ?? filter.status} conversations`
          : "Conversations";
  return filter.sinceDays ? `${base} in the last ${plural(filter.sinceDays, "day")}` : base;
}

function TicketRow({ ticket }: { ticket: TicketSummary }) {
  return (
    <li>
      <Link
        href={inboxHref(ticket.conversationId)}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
      >
        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">#{ticket.ticketNumber}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">{ticket.customerName}</span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{ticket.subject || "No subject"}</span>
        </span>
        <span className="hidden shrink-0 text-xs text-gray-400 sm:inline dark:text-gray-500">
          {CHANNEL_LABEL[ticket.channel] ?? ticket.channel} · {relativeTime(ticket.updatedAt)}
        </span>
        {ticket.priority !== "normal" && (
          <Badge size="sm" color="error">
            {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
          </Badge>
        )}
        <StatusBadge status={ticket.status} />
      </Link>
    </li>
  );
}

export function TicketListView({ data }: { data: TicketListCard }) {
  const [showAll, setShowAll] = useState(false);
  const tickets = showAll ? data.tickets : data.tickets.slice(0, 8);
  return (
    <CardShell
      label="Conversations"
      title={ticketListTitle(data.filter)}
      meta={plural(data.tickets.length, "conversation")}
      action={<HeaderLink href="/inbox">Open Inbox</HeaderLink>}
    >
      {data.tickets.length === 0 ? (
        <Empty>No conversations match.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.conversationId} ticket={ticket} />
          ))}
        </ul>
      )}
      <ShowAll total={data.tickets.length} shown={tickets.length} onClick={() => setShowAll(true)} />
    </CardShell>
  );
}

export function TicketView({ data }: { data: TicketCard }) {
  const facts = [
    CHANNEL_LABEL[data.channel] ?? data.channel,
    plural(data.messageCount, "message"),
    `updated ${relativeTime(data.updatedAt)}`,
  ];
  return (
    <CardShell
      label={`Ticket ${data.ticketNumber}`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>
            <span className="font-mono tabular-nums text-gray-400 dark:text-gray-500">#{data.ticketNumber}</span> {data.customerName}
          </span>
          <StatusBadge status={data.status} />
          {data.humanControlled && (
            <Badge size="sm" color="warning">
              Taken over
            </Badge>
          )}
        </span>
      }
      meta={[data.subject || "No subject", ...facts].join(" · ")}
      action={<HeaderLink href={inboxHref(data.conversationId)}>Open in Inbox</HeaderLink>}
    >
      {data.latest.length === 0 ? (
        <Empty>No messages yet.</Empty>
      ) : (
        <ol className="space-y-2.5 px-4 py-3">
          {data.latest.map((message, index) => (
            <li key={index} className="text-xs leading-5">
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {message.senderName}
                <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{relativeTime(message.createdAt)}</span>
              </p>
              <p className="line-clamp-3 text-gray-600 dark:text-gray-400">{message.body}</p>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}

export function KnowledgeResultsView({ data }: { data: KnowledgeResultsCard }) {
  return (
    <CardShell
      label="Knowledge results"
      title={`Knowledge on "${data.query}"`}
      meta={plural(data.matches.length, "match", "matches")}
      action={<HeaderLink href="/settings/knowledge">Open Knowledge</HeaderLink>}
    >
      {data.matches.length === 0 ? (
        <Empty>Nothing in the knowledge base covers this yet.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.matches.map((match, index) => (
            <li key={index} className="px-4 py-2.5">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {match.title}
                {match.heading && <span className="font-normal text-gray-500 dark:text-gray-400">: {match.heading}</span>}
              </p>
              {match.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{match.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function KnowledgeListView({ data }: { data: KnowledgeListCard }) {
  const [showAll, setShowAll] = useState(false);
  const articles = showAll ? data.articles : data.articles.slice(0, 10);
  const filtered = Boolean(data.titleContains) && data.matchedFilter;
  return (
    <CardShell
      label="Knowledge articles"
      title={filtered ? `Articles matching "${data.titleContains}"` : "Knowledge base"}
      meta={
        data.titleContains && !data.matchedFilter
          ? `No titles contain "${data.titleContains}", so here is every article.`
          : plural(data.total, "article")
      }
      action={<HeaderLink href="/settings/knowledge">Open Knowledge</HeaderLink>}
    >
      {data.articles.length === 0 ? (
        <Empty>The knowledge base is empty. Attach a file and choose &quot;Add to knowledge base&quot; to start.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {articles.map((article) => (
            <li key={article.conceptId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="truncate text-sm text-gray-800 dark:text-white/90">{article.title}</span>
              <span className="hidden shrink-0 font-mono text-[11px] text-gray-400 sm:inline dark:text-gray-500">{article.conceptId}</span>
            </li>
          ))}
        </ul>
      )}
      <ShowAll total={data.articles.length} shown={articles.length} onClick={() => setShowAll(true)} />
    </CardShell>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "warning" }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">{value}</p>
      {note && (
        <p className={`truncate text-xs ${tone === "warning" ? "text-warning-600 dark:text-warning-400" : "text-gray-500 dark:text-gray-400"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

export function ConfigView({ data }: { data: ConfigCard }) {
  const connected = data.integrations.filter((item) => item.status === "active").length;
  return (
    <CardShell
      label="Configuration"
      title={`${data.displayName} setup`}
      meta={`${data.status.charAt(0).toUpperCase() + data.status.slice(1)} · ${data.model} · ${data.tone} tone`}
      action={<HeaderLink href="/settings">Open Settings</HeaderLink>}
    >
      <div className="grid grid-cols-2 divide-gray-100 sm:grid-cols-3 dark:divide-gray-800 [&>*]:border-b [&>*]:border-gray-100 dark:[&>*]:border-gray-800">
        <Stat label="Channels" value={data.channels.length ? data.channels.join(", ") : "None on"} />
        <Stat
          label="Skills"
          value={`${data.skills.enabled} of ${data.skills.total} on`}
          note={data.skills.inactive ? `${data.skills.inactive} waiting on an integration` : undefined}
          tone="warning"
        />
        <Stat label="Knowledge" value={plural(data.knowledgeCount, "article")} />
        <Stat
          label="Mailbox"
          value={data.mailbox ? (data.mailbox.connected ? "Connected" : "Reconnect needed") : "Not connected"}
          note={data.mailbox?.email ?? undefined}
        />
        <Stat label="Integrations" value={`${connected} connected`} />
        <Stat
          label="Email domains"
          value={`${data.emailDomains.approved} approved`}
          note={data.emailDomains.pending ? `${data.emailDomains.pending} pending` : undefined}
        />
      </div>
      <p className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        Escalates below {Math.round(data.guardrails.confidenceThreshold * 100)}% confidence ·{" "}
        {plural(data.guardrails.escalationTerms, "escalation phrase")} · user verification{" "}
        {data.guardrails.requireUserVerification ? "on" : "off"} · Assistant actions {data.guardrails.assistantActions ? "on" : "off"} ·{" "}
        {plural(data.conversationCount, "real conversation")}
      </p>
    </CardShell>
  );
}

const SEVERITY: Record<AuditFinding["severity"], { label: string; color: "error" | "warning" | "info"; rank: number }> = {
  blocker: { label: "Blocker", color: "error", rank: 0 },
  warning: { label: "Warning", color: "warning", rank: 1 },
  tip: { label: "Tip", color: "info", rank: 2 },
};

export function ConfigAuditView({ data }: { data: ConfigAuditCard }) {
  const findings = [...data.findings].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const counts = (["blocker", "warning", "tip"] as const)
    .map((severity) => ({ severity, count: findings.filter((finding) => finding.severity === severity).length }))
    .filter((entry) => entry.count > 0);
  return (
    <CardShell
      label="Setup check"
      title="Setup check"
      meta={
        findings.length === 0
          ? "Everything the worker needs is in place."
          : counts.map(({ severity, count }) => plural(count, SEVERITY[severity].label.toLowerCase())).join(" · ")
      }
      action={<HeaderLink href="/settings">Open Settings</HeaderLink>}
    >
      {findings.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-success-700 dark:text-success-400">
          <CheckLineIcon className="size-4" />
          No problems found.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {findings.map((finding, index) => (
            <li key={index} className="flex gap-3 px-4 py-3">
              <div className="w-20 shrink-0 pt-0.5">
                <Badge size="sm" color={SEVERITY[finding.severity].color}>
                  {SEVERITY[finding.severity].label}
                </Badge>
              </div>
              <div className="min-w-0 text-sm">
                <p className="text-gray-800 dark:text-white/90">
                  <span className="font-medium">{finding.area}.</span> {finding.issue}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{finding.fix}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

const DRAFT_TITLE: Record<DraftCard["format"], string> = {
  email: "Draft email",
  chat: "Draft reply",
  article: "Draft article",
};

export function DraftView({ data, streaming }: { data: Partial<DraftCard>; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const format = data.format ?? "chat";
  const title = data.ticketNumber ? `${DRAFT_TITLE[format]} for #${data.ticketNumber}` : DRAFT_TITLE[format];
  const copy = async () => {
    if (!data.body) return;
    const text = data.subject && format === "email" ? `Subject: ${data.subject}\n\n${data.body}` : data.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <CardShell
      label={title}
      title={title}
      meta={data.subject ? (format === "article" ? data.subject : `Subject: ${data.subject}`) : "Nothing is sent until you send it."}
      action={
        <div className="flex items-center gap-2">
          {data.conversationId && <HeaderLink href={inboxHref(data.conversationId)}>Open ticket</HeaderLink>}
          <button
            type="button"
            onClick={copy}
            disabled={streaming || !data.body}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {copied ? <CheckLineIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      }
    >
      <div className="max-h-96 overflow-auto px-4 py-3 text-gray-700 dark:text-gray-200">
        <Markdown>{data.body ?? ""}</Markdown>
      </div>
    </CardShell>
  );
}

export function PanelView({ data }: { data: PanelCard }) {
  const { busy, panelRefresh, onPanelAction } = useContext(AssistantCardsContext);
  return <AssistantPanel kind={data.panel} refreshToken={panelRefresh} disabled={busy} onAction={onPanelAction} />;
}
