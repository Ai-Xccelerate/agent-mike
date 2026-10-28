"use client";

import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Button from "@/components/ui/button/Button";
import Markdown from "@/components/worker/Markdown";
import SuggestedReplyCard from "@/components/worker/SuggestedReplyCard";
import { PriorityPill, StatusPill } from "@/components/worker/WorkerTickets";
import { AlertIcon, ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon, DocsIcon, JiraIcon } from "@/icons";
import {
  CHANNEL_LABEL,
  DEFAULT_TICKET_SCHEMA,
  customerLabel,
  displayRequestType,
  STATUS_LABEL,
  fullTime,
  loadTicketOrder,
  relativeTime,
  ticketRef,
} from "@/lib/tickets";
import { apiFetch, WorkerApiError, type Conversation, type TicketSchema, type TicketsPayload, type WorkerProfile } from "@/lib/worker-api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const cardClass = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const outlineControl =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white/60 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]";
const fieldClass =
  "h-9 w-full rounded-lg border border-gray-200 bg-white/60 px-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 disabled:opacity-60 dark:border-white/[0.12] dark:bg-gray-900 dark:text-white/90";

const STATUSES: Conversation["status"][] = ["open", "needs_human", "resolved", "closed"];

function messageTime(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** A select with its own chevron, inset from the edge. The native arrow sits flush against the border. */
function SelectField({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative block ${className}`}>
      <select {...props} className={`${fieldClass} appearance-none pr-9`}>
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
    </span>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className={`group ${cardClass}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-display text-sm font-semibold text-gray-900 dark:text-white/90 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon className="size-4 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm text-gray-700 dark:text-gray-200">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-800 dark:text-gray-200">{children}</dd>
    </div>
  );
}

export default function WorkerTicketDetail({ id }: { id: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [ticket, setTicket] = useState<Conversation | null>(null);
  const [missing, setMissing] = useState(false);
  const [requestTypes, setRequestTypes] = useState<string[]>([]);
  const [schema, setSchema] = useState<TicketSchema>(DEFAULT_TICKET_SCHEMA);
  // The list order the manager came from. Read once: it is only shown after the ticket loads.
  const [order] = useState(() => loadTicketOrder());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
    apiFetch<TicketsPayload>("/tickets")
      .then((payload) => {
        setRequestTypes(payload.requestTypes.map((entry) => entry.name));
        setSchema(payload.schema);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    apiFetch<Conversation>(`/conversations/${id}`)
      .then(setTicket)
      .catch((error) => {
        if (error instanceof WorkerApiError && error.status === 404) setMissing(true);
        else setNotice("Could not load this ticket.");
      });
  }, [id]);

  const workerName = profile?.displayName || "The worker";
  const canChange = ticket?.canChange ?? false;
  const position = order.ids.indexOf(id);
  const previousId = position > 0 ? order.ids[position - 1] : null;
  const nextId = position >= 0 && position < order.ids.length - 1 ? order.ids[position + 1] : null;
  const backHref = order.source === "all_open" ? "/tickets" : `/tickets?queue=${order.source}`;

  async function save(patch: Record<string, unknown>, failure: string) {
    if (!ticket) return;
    setSaving(true);
    setNotice("");
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setTicket((current) => (current ? { ...current, ...updated, canChange: current.canChange, pendingActions: current.pendingActions } : current));
    } catch (error) {
      setNotice(error instanceof WorkerApiError ? error.message : failure);
    } finally {
      setSaving(false);
    }
  }

  // Replying takes the conversation over (the API does that with the message), and an email goes out in its thread.
  async function sendReply(text: string) {
    const body = text.trim();
    if (!ticket || !body) return;
    setReplying(true);
    setNotice("");
    try {
      const result = await apiFetch<{ conversation: Conversation }>(`/conversations/${ticket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setTicket((current) =>
        current
          ? {
              ...current,
              status: result.conversation.status,
              humanControlled: result.conversation.humanControlled,
              assignedTo: result.conversation.assignedTo,
              updatedAt: result.conversation.updatedAt,
              messages: result.conversation.messages.map(
                (message) => ({ ...message, customerFiles: current.messages.find((known) => known.id === message.id)?.customerFiles }),
              ),
            }
          : current,
      );
      setReply("");
    } catch (error) {
      setNotice(error instanceof WorkerApiError ? error.message : "Could not send the reply. Try again.");
      throw error;
    } finally {
      setReplying(false);
    }
  }

  function addLabel() {
    const label = labelDraft.trim();
    if (!label || !ticket) return;
    setLabelDraft("");
    void save({ labels: [...new Set([...(ticket.labels ?? []), label])] }, "Could not add the label.");
  }

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-display text-xl font-semibold text-gray-900 dark:text-white/90">Ticket not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">It may have been deleted, or it belongs to another worker.</p>
        <Link href="/tickets" className={outlineControl}>Back to tickets</Link>
      </div>
    );
  }

  if (!ticket) {
    return (
      <p aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">
        {notice || "Loading ticket"}
      </p>
    );
  }

  const ref = ticketRef(profile?.ticketPrefix, ticket);
  const who = customerLabel(ticket);
  const title = ticket.subject?.trim() || who.name;
  const handler = ticket.status === "needs_human" || ticket.humanControlled || ticket.externalTicketKey ? "human" : "worker";
  const priority = ticket.externalTicketPriority ?? (ticket.priority !== "normal" ? ticket.priority : null);
  const requestType = displayRequestType(ticket);
  const typeOptions = [...new Set([...requestTypes, requestType].filter(Boolean))];
  const tierOptions = [...new Set([...schema.tiers, ticket.tier ?? ""].filter(Boolean))];
  const labelSuggestions = schema.labels.filter((label) => !(ticket.labels ?? []).includes(label));
  const closed = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div data-aix-id="AIX-113" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className={`${outlineControl} !px-2.5`}>
          <ChevronLeftIcon className="size-4" />
          Back
        </Link>
        <span className="font-mono text-sm text-brand-600 dark:text-brand-400">{ref}</span>
        <button
          type="button"
          aria-label="Previous ticket"
          disabled={!previousId}
          onClick={() => previousId && router.push(`/tickets/${previousId}`)}
          className={`${outlineControl} !w-9 !px-0`}
        >
          <ChevronUpIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next ticket"
          disabled={!nextId}
          onClick={() => nextId && router.push(`/tickets/${nextId}`)}
          className={`${outlineControl} !w-9 !px-0`}
        >
          <ChevronDownIcon className="size-4" />
        </button>
        {position >= 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {position + 1} of {order.ids.length}
          </span>
        )}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white/90">{title}</h1>
        <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          Status
          <SelectField
            aria-label="Status"
            value={ticket.status}
            disabled={!canChange || saving}
            onChange={(event) => void save({ status: event.target.value }, "Could not update the status.")}
            className="w-48 font-medium"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </SelectField>
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {canChange && !closed && (ticket.humanControlled ? (
          <button type="button" disabled={saving} onClick={() => void save({ humanControlled: false }, "Could not hand this back.")} className={outlineControl}>
            Hand back to {workerName}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save({ humanControlled: true }, "Could not take over this ticket.")}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(244,121,32,0.25)] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none"
          >
            Take over
          </button>
        ))}
        <Link href={`/inbox?conversation=${ticket.id}`} className={outlineControl}>
          Reply in Inbox
        </Link>
        {ticket.externalTicketKey &&
          (ticket.externalTicketUrl ? (
            <a
              href={ticket.externalTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${ticket.externalTicketKey} in Jira`}
              className={`${outlineControl} font-mono`}
            >
              <JiraIcon className="size-4" />
              {ticket.externalTicketKey}
              <span className="sr-only">(opens Jira in a new tab)</span>
              <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
                ↗
              </span>
            </a>
          ) : (
            <span className={`${outlineControl} cursor-default font-mono`} title="Connect Jira in Settings to open this ticket from here.">
              <JiraIcon className="size-4" />
              {ticket.externalTicketKey}
            </span>
          ))}
        {notice && (
          <span role="alert" className="text-sm text-warning-700 dark:text-warning-400">
            {notice}
          </span>
        )}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {ticket.externalTicketError && (
            <p className="flex items-start gap-2.5 rounded-2xl border border-warning-200 bg-warning-25 px-3.5 py-2.5 text-sm text-gray-700 dark:border-warning-500/25 dark:bg-warning-500/[0.08] dark:text-gray-300">
              <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning-600 dark:text-warning-400" />
              <span className="min-w-0 break-words">
                <span className="font-medium text-gray-900 dark:text-white/90">The Jira ticket was not created.</span> {ticket.externalTicketError}
              </span>
            </p>
          )}

          <Section title="Key details">
            <p>
              {ticket.channel === "email" ? "Received" : "Started"} by <span className="font-medium">{who.name}</span>
              {who.unverified && <span className="text-gray-500 dark:text-gray-400"> (said in chat)</span>} on{" "}
              {CHANNEL_LABEL[ticket.channel] ?? ticket.channel}, {fullTime(ticket.createdAt)}
            </p>
            {ticket.ticketSummary ?? ticket.summary ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Summary</p>
                <p className="leading-6 text-gray-700 dark:text-gray-300">{ticket.ticketSummary ?? ticket.summary}</p>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No summary yet.</p>
            )}
          </Section>

          <Section title={`Conversation (${ticket.messages.length})`}>
            {ticket.messages.length === 0 && <p className="text-gray-500 dark:text-gray-400">No messages yet.</p>}
            {ticket.messages.map((message) => {
              const isCustomer = message.senderType === "customer";
              const isAgent = message.senderType === "agent";
              return (
                <article
                  key={message.id}
                  className={`rounded-lg px-3.5 py-2.5 text-gray-800 dark:text-gray-100 ${
                    isCustomer
                      ? "bg-gray-50 dark:bg-white/[0.04]"
                      : isAgent
                        ? "bg-brand-50 dark:bg-brand-500/[0.12]"
                        : "border border-brand-200 bg-white dark:border-brand-500/30 dark:bg-white/[0.03]"
                  }`}
                >
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-white/90">{message.senderName}</span>
                    {isAgent ? "AI" : isCustomer ? "Customer" : "Team"} · {messageTime(message.createdAt)}
                  </p>
                  {isAgent ? <Markdown>{message.body}</Markdown> : <p className="whitespace-pre-wrap leading-6">{message.body}</p>}
                  {message.citations.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {message.citations.map((citation, index) => {
                        const label = typeof citation === "string" ? citation : (citation as { title?: string })?.title ?? "Source";
                        return (
                          <span
                            key={`${message.id}-${index}`}
                            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300"
                          >
                            <DocsIcon className="size-3.5" />
                            {label}
                          </span>
                        );
                      })}
                    </p>
                  )}
                </article>
              );
            })}
          </Section>

          {!closed && (
            <Section title="Reply to the customer">
              {ticket.messages.some((message) => message.senderType === "customer") && (
                <SuggestedReplyCard
                  conversationId={ticket.id}
                  lastMessageKey={ticket.messages[ticket.messages.length - 1]?.id ?? "none"}
                  autoStart={ticket.status === "needs_human" && !ticket.humanControlled}
                  sending={replying}
                  onSend={sendReply}
                />
              )}
              <AutoGrowTextarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                minRows={3}
                maxRows={10}
                maxLength={4000}
                aria-label="Reply"
                placeholder="Write a reply…"
                className="block w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.12] dark:bg-gray-900 dark:text-white/90"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {ticket.humanControlled
                    ? `You're handling this. ${workerName} won't reply until you hand it back.`
                    : `Sending a reply takes over from ${workerName}.`}
                </span>
                <Button size="sm" loading={replying} disabled={!reply.trim()} onClick={() => void sendReply(reply).catch(() => undefined)}>
                  Send
                </Button>
              </div>
            </Section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Section title="Details">
            <dl className="flex flex-col gap-3.5">
              <Field label="Handled by">{handler === "worker" ? workerName : ticket.assignedTo || "A person"}</Field>
              <Field label="Status">
                <StatusPill status={ticket.status} />
              </Field>
              <Field label="Priority">{priority ? <PriorityPill priority={priority} /> : <span className="text-gray-500 dark:text-gray-400">Not set</span>}</Field>
              <Field label="Request type">
                <SelectField
                  aria-label="Request type"
                  value={requestType}
                  disabled={!canChange || saving}
                  onChange={(event) => void save({ requestType: event.target.value || null }, "Could not save the request type.")}
                >
                  <option value="">Not set</option>
                  {typeOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tier">
                <SelectField
                  aria-label="Tier"
                  value={ticket.tier ?? ""}
                  disabled={!canChange || saving}
                  onChange={(event) => void save({ tier: event.target.value || null }, "Could not save the tier.")}
                >
                  <option value="">Not set</option>
                  {tierOptions.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Labels">
                <span className="flex flex-wrap gap-1.5">
                  {(ticket.labels ?? []).map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-0.5 font-mono text-xs text-gray-700 dark:border-white/[0.12] dark:text-gray-300"
                    >
                      {label}
                      {canChange && (
                        <button
                          type="button"
                          aria-label={`Remove label ${label}`}
                          disabled={saving}
                          onClick={() => void save({ labels: (ticket.labels ?? []).filter((item) => item !== label) }, "Could not remove the label.")}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          x
                        </button>
                      )}
                    </span>
                  ))}
                  {(ticket.labels ?? []).length === 0 && <span className="text-gray-500 dark:text-gray-400">None</span>}
                </span>
                {canChange && (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addLabel();
                    }}
                  >
                    <input
                      value={labelDraft}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      maxLength={40}
                      placeholder="Add a label"
                      aria-label="Add a label"
                      list="ticket-label-suggestions"
                      className={fieldClass}
                    />
                    <datalist id="ticket-label-suggestions">
                      {labelSuggestions.map((label) => (
                        <option key={label} value={label} />
                      ))}
                    </datalist>
                    <button type="submit" disabled={!labelDraft.trim() || saving} className={outlineControl}>
                      Add
                    </button>
                  </form>
                )}
              </Field>
              {ticket.classificationSource && (
                <Field label="Sorted by">
                  {ticket.classificationSource === "manual" ? "A person. The worker will not change it." : `${workerName}, from this conversation.`}
                </Field>
              )}
              <Field label="Customer">
                {who.name}
                {who.email && <span className="block break-all text-gray-500 dark:text-gray-400">{who.email}</span>}
                {who.unverified && <span className="block text-xs text-gray-500 dark:text-gray-400">Said in the chat. Not verified.</span>}
              </Field>
              <Field label="Updated">{relativeTime(ticket.updatedAt)}</Field>
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}
