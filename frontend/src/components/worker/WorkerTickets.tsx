"use client";

import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { CheckLineIcon, ChevronDownIcon, JiraIcon } from "@/icons";
import {
  TICKET_QUEUES,
  STATUS_LABEL,
  filterTickets,
  inQueue,
  isPriorityUrgent,
  relativeTime,
  saveTicketOrder,
  ticketRef,
  ticketTitle,
  type TicketHandlerFilter,
} from "@/lib/tickets";
import { apiFetch, type Ticket, type TicketQueueId, type TicketsPayload, type WorkerProfile } from "@/lib/worker-api";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const cardClass = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const outlineControl =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white/60 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]";

const HANDLER_OPTIONS: { id: TicketHandlerFilter; label: string }[] = [
  { id: "all", label: "Anyone" },
  { id: "worker", label: "The worker" },
  { id: "human", label: "A person" },
];

const STATUS_TONE: Record<Ticket["status"], string> = {
  open: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  needs_human: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  resolved: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  closed: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-theme-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: Ticket["status"] }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function PriorityPill({ priority }: { priority: string }) {
  return (
    <Pill
      tone={
        isPriorityUrgent(priority)
          ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500"
          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
      }
    >
      {priority}
    </Pill>
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
      type="button"
      role="menuitemcheckbox"
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{count}</span>}
    </button>
  );
}

function StatTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cardClass} flex flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:border-gray-300 dark:hover:border-white/20 ${
        active ? "!border-brand-500" : ""
      }`}
    >
      <span className="font-display text-2xl font-semibold tabular-nums text-gray-900 dark:text-white/90">{value}</span>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    </button>
  );
}

function queueFromParam(wanted: string | null): TicketQueueId {
  return TICKET_QUEUES.some((queue) => queue.id === wanted) ? (wanted as TicketQueueId) : "all_open";
}

export default function WorkerTickets() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [payload, setPayload] = useState<TicketsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<TicketQueueId>(() => queueFromParam(searchParams.get("queue")));
  const [search, setSearch] = useState("");
  const [requestTypes, setRequestTypes] = useState<string[]>([]);
  const [handler, setHandler] = useState<TicketHandlerFilter>("all");
  const [typeOpen, setTypeOpen] = useState(false);
  const [handlerOpen, setHandlerOpen] = useState(false);

  useEffect(() => {
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
    apiFetch<TicketsPayload>("/tickets")
      .then(setPayload)
      .catch(() => setFailed(true));
  }, []);

  const workerName = profile?.displayName || "The worker";
  const prefix = profile?.ticketPrefix;
  const filters = useMemo(() => ({ queue, search, requestTypes, handler }), [queue, search, requestTypes, handler]);
  const visible = useMemo(
    () => (payload ? filterTickets(payload.tickets, filters, prefix) : []),
    [payload, filters, prefix],
  );
  const activeFilters = (requestTypes.length ? 1 : 0) + (handler !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

  // Request types that exist in the queue being looked at, with how many tickets each would list.
  const typeOptions = useMemo(() => {
    if (!payload) return [];
    const inThisQueue = payload.tickets.filter((ticket) => inQueue(ticket, queue));
    const counts = new Map<string, number>(payload.requestTypes.map((entry) => [entry.name, 0]));
    for (const ticket of inThisQueue) {
      if (ticket.requestType) counts.set(ticket.requestType, (counts.get(ticket.requestType) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [payload, queue]);

  function openTicket(ticket: Ticket) {
    saveTicketOrder(visible.map((item) => item.id), queue);
    router.push(`/tickets/${ticket.id}`);
  }

  function spotCheck() {
    if (!payload || payload.sampleIds.length === 0) return;
    const shuffled = [...payload.sampleIds].sort(() => Math.random() - 0.5).slice(0, 5);
    saveTicketOrder(shuffled, "worker");
    router.push(`/tickets/${shuffled[0]}`);
  }

  function pickQueue(next: TicketQueueId) {
    setQueue(next);
    window.history.replaceState(null, "", next === "all_open" ? "/tickets" : `/tickets?queue=${next}`);
  }

  // Left and right arrows, Home and End move between the queue tabs, as in the shared Tabs.
  const tabRefs = useRef<Partial<Record<TicketQueueId, HTMLButtonElement | null>>>({});
  function onQueueKeyDown(event: React.KeyboardEvent) {
    const index = TICKET_QUEUES.findIndex((entry) => entry.id === queue);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TICKET_QUEUES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TICKET_QUEUES.length) % TICKET_QUEUES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TICKET_QUEUES.length - 1;
    else return;
    event.preventDefault();
    const target = TICKET_QUEUES[next].id;
    pickQueue(target);
    tabRefs.current[target]?.focus();
  }

  function clearFilters() {
    setSearch("");
    setRequestTypes([]);
    setHandler("all");
  }

  const activeQueue = TICKET_QUEUES.find((entry) => entry.id === queue) ?? TICKET_QUEUES[0];

  return (
    <div data-aix-id="AIX-112" className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900 dark:text-white/90">Tickets</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Every customer conversation, sorted into queues. Reply to customers in the Inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={spotCheck}
          disabled={!payload || payload.sampleIds.length === 0}
          title={payload && payload.sampleIds.length === 0 ? `Nothing answered by ${workerName} in the last 24 hours yet.` : undefined}
          className={outlineControl}
        >
          Spot check {workerName}
        </button>
      </header>

      {failed && (
        <p role="alert" className="rounded-2xl border border-warning-200 bg-warning-25 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/25 dark:bg-warning-500/[0.08] dark:text-warning-400">
          Could not load tickets. Refresh to try again.
        </p>
      )}

      <div
        data-aix-id="AIX-112.1"
        className={`grid grid-cols-1 gap-3 ${payload?.helpdesk ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        <StatTile label="Open tickets" value={payload?.kpis.open ?? 0} active={queue === "all_open"} onClick={() => pickQueue("all_open")} />
        <StatTile label="Need a person" value={payload?.kpis.needsHuman ?? 0} active={queue === "needs_human"} onClick={() => pickQueue("needs_human")} />
        <StatTile
          label={`Handled by ${workerName} in 24 hours`}
          value={payload?.kpis.workerHandledToday ?? 0}
          active={queue === "worker"}
          onClick={() => pickQueue("worker")}
        />
        {payload?.helpdesk && (
          <StatTile
            label={`Sent to ${payload.helpdesk.project} in 24 hours`}
            value={payload.kpis.raisedToday}
            active={false}
            onClick={() => {
              setSearch(payload.helpdesk?.project ?? "");
              pickQueue("all_open");
            }}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div
          role="tablist"
          aria-label="Ticket queues"
          data-aix-id="AIX-112.2"
          onKeyDown={onQueueKeyDown}
          className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-white/[0.08]"
        >
          {TICKET_QUEUES.map((entry) => {
            const active = entry.id === queue;
            return (
              <button
                key={entry.id}
                ref={(element) => {
                  tabRefs.current[entry.id] = element;
                }}
                type="button"
                role="tab"
                id={`ticket-queue-tab-${entry.id}`}
                aria-selected={active}
                aria-controls="ticket-queue-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => pickQueue(entry.id)}
                title={entry.hint}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 ${
                  active
                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {entry.label}
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums leading-5 ${
                    active
                      ? "bg-brand-500/[0.12] text-brand-700 dark:text-brand-400"
                      : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                  }`}
                >
                  {payload?.queues[entry.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <section
          id="ticket-queue-panel"
          role="tabpanel"
          aria-labelledby={`ticket-queue-tab-${queue}`}
          data-aix-id="AIX-112.3"
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tickets"
              aria-label="Search tickets"
              className="h-9 w-full rounded-lg border border-gray-200 bg-white/60 px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 sm:w-64 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white/90"
            />
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={typeOpen}
                className={`dropdown-toggle ${outlineControl} ${requestTypes.length ? "!border-brand-500" : ""}`}
              >
                Request type{requestTypes.length > 0 && <span className="tabular-nums text-brand-600 dark:text-brand-400">{requestTypes.length}</span>}
                <ChevronDownIcon className="size-3.5" />
              </button>
              <Dropdown isOpen={typeOpen} onClose={() => setTypeOpen(false)} className="max-h-80 w-72 overflow-y-auto p-2 shadow-theme-lg">
                {typeOptions.length === 0 ? (
                  <p className="px-2.5 py-3 text-sm text-gray-500 dark:text-gray-400">No request types yet.</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {typeOptions.map((option) => (
                      <FilterOption
                        key={option.name}
                        label={option.name}
                        count={option.count}
                        active={requestTypes.includes(option.name)}
                        onClick={() =>
                          setRequestTypes((current) =>
                            current.includes(option.name) ? current.filter((name) => name !== option.name) : [...current, option.name],
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </Dropdown>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setHandlerOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={handlerOpen}
                className={`dropdown-toggle ${outlineControl} ${handler !== "all" ? "!border-brand-500" : ""}`}
              >
                Handled by: {HANDLER_OPTIONS.find((option) => option.id === handler)?.label}
                <ChevronDownIcon className="size-3.5" />
              </button>
              <Dropdown isOpen={handlerOpen} onClose={() => setHandlerOpen(false)} className="w-48 p-2 shadow-theme-lg">
                <div className="flex flex-col gap-0.5">
                  {HANDLER_OPTIONS.map((option) => (
                    <FilterOption
                      key={option.id}
                      label={option.label}
                      active={handler === option.id}
                      onClick={() => {
                        setHandler(option.id);
                        setHandlerOpen(false);
                      }}
                    />
                  ))}
                </div>
              </Dropdown>
            </div>
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                Clear filters
              </button>
            )}
          </div>

          <p aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">
            {payload ? `${visible.length} ${visible.length === 1 ? "ticket" : "tickets"} in ${activeQueue.label.toLowerCase()}` : "Loading tickets"}
          </p>

          <div className={`${cardClass} min-h-0 overflow-auto`}>
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                  <th scope="col" className="px-3 py-3">Request type</th>
                  <th scope="col" className="px-3 py-3">Ticket</th>
                  <th scope="col" className="px-3 py-3">Summary</th>
                  <th scope="col" className="px-3 py-3">Labels</th>
                  <th scope="col" className="px-3 py-3">Handled by</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {payload && visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      {activeFilters > 0 ? "No tickets match these filters." : "No tickets in this queue."}
                    </td>
                  </tr>
                )}
                {visible.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      openTicket(ticket);
                    }}
                    className="cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-900/[0.03] dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                  >
                    <td className="max-w-[160px] px-3 py-3 text-gray-700 dark:text-gray-300">
                      <span className="block truncate">{ticket.requestType ?? <span className="text-gray-400 dark:text-gray-500">Not set</span>}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      <span className="block">{ticketRef(prefix, ticket)}</span>
                      {ticket.externalTicketKey && (
                        <span className="mt-0.5 flex items-center gap-1 text-gray-400 dark:text-gray-500">
                          <JiraIcon className="size-3" />
                          {ticket.externalTicketKey}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <a
                        href={`/tickets/${ticket.id}`}
                        onClick={(event) => {
                          // A plain click goes through the row so the list order is kept; a modified click opens a new tab.
                          if (!(event.metaKey || event.ctrlKey || event.shiftKey)) event.preventDefault();
                        }}
                        className="block truncate font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {ticketTitle(ticket)}
                      </a>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{ticket.customerName}</span>
                    </td>
                    <td className="max-w-[190px] px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        {ticket.priority && <PriorityPill priority={ticket.priority} />}
                        {ticket.tier && <Pill tone="bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">{ticket.tier}</Pill>}
                        {ticket.labels.slice(0, 1).map((label) => (
                          <Pill key={label} tone="bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
                            <span className="truncate">{label}</span>
                          </Pill>
                        ))}
                        {ticket.labels.length > 1 && (
                          <span title={ticket.labels.slice(1).join(", ")} className="text-xs text-gray-400 dark:text-gray-500">
                            +{ticket.labels.length - 1}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300">
                      {ticket.handler === "worker" ? workerName : "A person"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-500 dark:text-gray-400">{relativeTime(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
