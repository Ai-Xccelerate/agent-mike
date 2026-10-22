"use client";

import { useWorkerIdentityDisplay } from "@/context/WorkerIdentityContext";
import { ChatIcon, CheckCircleIcon, ChevronLeftIcon, ChevronDownIcon, TaskIcon, UserCircleIcon } from "@/icons";
import { apiFetch, type OverviewFilters, type OverviewPeriod, type OverviewRecentOutcome, type WorkerOverview } from "@/lib/worker-api";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { FEEDBACK_REASON_LABELS } from "@/lib/answer-feedback";
import { DEFAULT_ROW_LIMIT } from "@/lib/overview-rows";
import { ConversationsOverTime, CountBars, PriorityColumns, StatusDonut } from "./overview/OverviewCharts";

/**
 * The Overview, laid out like a service desk's summary page: filters across the top, four numbers, a grid of charts,
 * then the activity list. Everything is Mike's own: how much customer traffic the worker had, how much it answered
 * itself, what it handed to a person, and what it cited. The numbers come from /worker/overview; nothing here knows
 * any one customer's helpdesk, and nothing is drawn that the API did not count.
 */

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const NO_FILTERS: OverviewFilters = { channel: null, requestType: null, priority: null };

const cardClass = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const headingClass = "text-base font-semibold text-gray-800 dark:text-white/90";
const mutedClass = "text-sm text-gray-500 dark:text-gray-400";
const selectClass =
  "h-10 rounded-lg border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:[color-scheme:dark]";

const CHANNEL_LABELS: Record<string, string> = { widget: "Website chat", email: "Email", chat: "Playground" };

function timeOfDay(iso: string, period: OverviewPeriod) {
  const date = new Date(iso);
  return period === "24h"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function channelLine(byChannel: Record<string, number>) {
  const parts = Object.entries(byChannel).map(([channel, count]) => `${CHANNEL_LABELS[channel] ?? channel} ${count}`);
  return parts.length ? parts.join(" · ") : "No customer conversations yet";
}

function Tile({ icon, value, label, note }: { icon: ReactNode; value: string; label: string; note?: ReactNode }) {
  return (
    <div className={`${cardClass} flex items-center gap-4 p-5`}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold tabular-nums text-gray-800 dark:text-white/90">{value}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{label}</p>
        {note && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      </div>
    </div>
  );
}

function Panel({ id, title, hint, children, className = "" }: { id: string; title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`${cardClass} p-5 md:p-6 ${className}`}>
      <h2 id={id} className={headingClass}>
        {title}
      </h2>
      {hint && <p className={`${mutedClass} mt-0.5`}>{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  format = (option) => option,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  format?: (option: string) => string;
  onChange: (value: string | null) => void;
}) {
  if (!options.length && !value) return null;
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} className={`${selectClass} appearance-none ${value ? "border-brand-500 text-brand-600 dark:text-brand-400" : ""}`}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
    </label>
  );
}

function Outcome({ outcome }: { outcome: OverviewRecentOutcome }) {
  if (outcome.kind === "ticket") {
    return (
      <span>
        Raised <span className="font-semibold text-gray-800 dark:text-white/90">{outcome.key}</span>
        {outcome.type ? ` as ${outcome.type}` : ""}
      </span>
    );
  }
  if (outcome.kind === "answered") return <span>{outcome.source ? `Answered from: ${outcome.source}` : "Answered"}</span>;
  if (outcome.kind === "handed_over") return <span>Handed to a person</span>;
  return <span>In progress</span>;
}

export default function WorkerDashboard() {
  const [period, setPeriod] = useState<OverviewPeriod>("24h");
  const [filters, setFilters] = useState<OverviewFilters>(NO_FILTERS);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState<WorkerOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const { displayName } = useWorkerIdentityDisplay("This worker");

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ period, page: String(page) });
    if (filters.channel) query.set("channel", filters.channel);
    if (filters.requestType) query.set("request_type", filters.requestType);
    if (filters.priority) query.set("priority", filters.priority);
    apiFetch<WorkerOverview>(`/worker/overview?${query.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [period, filters, page]);

  const narrow = (next: Partial<OverviewFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(0);
  };
  const filtered = Boolean(filters.channel || filters.requestType || filters.priority);

  const total = overview?.conversations.total ?? 0;
  const answered = overview?.answeredByWorker ?? 0;
  const answeredPct = total ? Math.round((answered / total) * 100) : 0;
  const helpdesk = overview?.tickets.helpdesk ?? null;
  const waiting = overview?.waitingNow ?? 0;
  const paging = overview?.recentPage;
  const lastPage = paging ? Math.max(0, Math.ceil(paging.total / paging.pageSize) - 1) : 0;
  const shownFrom = paging && paging.total ? paging.page * paging.pageSize + 1 : 0;
  const shownTo = paging ? Math.min(paging.total, (paging.page + 1) * paging.pageSize) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6">
      <header>
        <h1 className="font-display text-xl font-semibold text-gray-800 dark:text-white/90">Overview</h1>
        <p className={mutedClass}>What {displayName} handled, and what it passed to your team.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filters">
        <div role="group" aria-label="Period" className="flex gap-2">
          {PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={period === entry.id}
              onClick={() => {
                setPeriod(entry.id);
                setPage(0);
              }}
              className={`h-10 rounded-lg border px-3.5 text-sm transition-colors ${
                period === entry.id
                  ? "border-brand-500 bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <FilterSelect
          label="Channel"
          value={filters.channel}
          options={overview?.filterOptions.channels ?? []}
          format={(option) => CHANNEL_LABELS[option] ?? option}
          onChange={(channel) => narrow({ channel })}
        />
        <FilterSelect label="Request type" value={filters.requestType} options={overview?.filterOptions.requestTypes ?? []} onChange={(requestType) => narrow({ requestType })} />
        <FilterSelect label="Priority" value={filters.priority} options={overview?.filterOptions.priorities ?? []} onChange={(priority) => narrow({ priority })} />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setFilters(NO_FILTERS);
              setPage(0);
            }}
            className="h-10 rounded-lg px-3 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Reset
          </button>
        )}
      </div>

      {failed && (
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          Couldn&apos;t load the numbers. Try again in a moment.
        </p>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <Tile
          icon={<ChatIcon className="size-5" />}
          value={overview ? String(total) : "…"}
          label="Conversations"
          note={overview ? channelLine(overview.conversations.byChannel) : ""}
        />
        <Tile
          icon={<CheckCircleIcon className="size-5" />}
          value={overview ? `${answeredPct}%` : "…"}
          label={`Answered by ${displayName}`}
          note={overview ? `${answered} of ${total}, without a person` : ""}
        />
        <Tile
          icon={<UserCircleIcon className="size-5" />}
          value={overview ? String(overview.handedOver) : "…"}
          label="Handed to a person"
          note={
            overview ? (
              waiting > 0 ? (
                <Link href="/inbox" className="font-medium text-warning-600 hover:text-warning-700 dark:text-warning-400">
                  {waiting} waiting for a person now
                </Link>
              ) : (
                "None waiting right now"
              )
            ) : (
              ""
            )
          }
        />
        <Tile
          icon={<TaskIcon className="size-5" />}
          value={overview ? String(helpdesk ? overview.tickets.raised : waiting) : "…"}
          label={helpdesk ? "Tickets raised" : "Waiting for a person"}
          note={helpdesk ? `in ${helpdesk.project}` : "in the Inbox now"}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 md:gap-6">
        <Panel id="over-time" title="Conversations over time" hint={`Per ${overview?.series.bucket ?? "day"}, answered without a person and handed to one.`}>
          {overview ? <ConversationsOverTime series={overview.series} /> : <p className={mutedClass}>Loading…</p>}
        </Panel>

        {helpdesk ? (
          <Panel id="by-type" title="Tickets by request type" hint={`The request types of your connected service desk (${helpdesk.project}).`}>
            <CountBars rows={overview?.tickets.byType ?? []} empty="No tickets in this period." limit={DEFAULT_ROW_LIMIT} noun="request types" />
          </Panel>
        ) : (
          <Panel
            id="topics"
            title="Handed over by topic"
            hint={
              <>
                Connect a helpdesk under{" "}
                <Link href="/settings/integrations" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Integrations
                </Link>{" "}
                to see these by request type and priority.
              </>
            }
          >
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {overview?.handedOverTopics.map((topic) => <li key={topic}>{topic}</li>)}
              {overview && !overview.handedOverTopics.length && <li className={mutedClass}>Nothing handed over in this period.</li>}
            </ul>
          </Panel>
        )}

        <Panel id="status" title="Status" hint="Where this period's conversations stand now.">
          {overview ? <StatusDonut byStatus={overview.byStatus} /> : <p className={mutedClass}>Loading…</p>}
        </Panel>

        {helpdesk && (
          <Panel id="by-priority" title="Priority" hint={`Your service desk's priorities. ${displayName} sets them from the impact the customer describes.`}>
            <PriorityColumns byPriority={overview?.tickets.byPriority ?? []} />
          </Panel>
        )}

        <Panel
          id="sources"
          title="Most-used articles"
          hint={`What ${displayName} cited most. A topic that is handed over but never cited is a gap in your knowledge.`}
        >
          <CountBars
            rows={(overview?.topSources ?? []).map((source) => ({ name: source.title, count: source.count }))}
            empty="No answers cited an article in this period."
            labelTrack="minmax(14rem, 26rem)"
          />
        </Panel>

        <Panel
          id="quality"
          title="Answer quality"
          hint={`How your managers rated ${displayName}'s replies. Rate them in the Inbox.`}
        >
          {overview && overview.quality.rated > 0 ? (
            <div className="space-y-5">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-semibold tabular-nums text-gray-800 dark:text-white/90">
                  {Math.round((overview.quality.good / overview.quality.rated) * 100)}%
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  rated good ({overview.quality.good} good, {overview.quality.bad} bad)
                </span>
              </div>
              {overview.quality.byReason.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">What was wrong</p>
                  <CountBars rows={overview.quality.byReason.map((entry) => ({ name: FEEDBACK_REASON_LABELS[entry.reason], count: entry.count }))} empty="" />
                </div>
              )}
            </div>
          ) : (
            <p className={mutedClass}>
              {overview ? (
                <>
                  No replies rated in this period. Open a conversation in the{" "}
                  <Link href="/inbox" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    Inbox
                  </Link>{" "}
                  and mark an answer good or bad.
                </>
              ) : (
                "Loading…"
              )}
            </p>
          )}
        </Panel>
      </div>

      <section aria-labelledby="recent" className={`${cardClass} flex flex-col`}>
        <div className="flex items-center justify-between px-5 pt-5 md:px-6">
          <h2 id="recent" className={headingClass}>
            Activity
          </h2>
          <Link href="/inbox" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
            View inbox
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">When</th>
                <th scope="col" className="px-2 py-3 font-medium">Customer asked</th>
                <th scope="col" className="px-5 py-3 font-medium md:px-6">What {displayName} did</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {overview?.recent.map((entry) => (
                <tr key={entry.conversationId}>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500 dark:text-gray-400 md:px-6">{timeOfDay(entry.at, overview.period)}</td>
                  <td className="px-2 py-3 text-gray-800 dark:text-white/90">
                    <Link href={`/inbox?conversation=${entry.conversationId}`} className="hover:text-brand-600">
                      {entry.asked || "(no message)"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-300 md:px-6">
                    <Outcome outcome={entry.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {overview && !overview.recent.length && (
            <p className="px-5 py-10 text-center text-sm text-gray-500 md:px-6">
              {filtered
                ? "Nothing matches these filters."
                : "No customer conversations in this period. They appear here once someone writes in over the website widget or email."}
            </p>
          )}
        </div>
        {paging && paging.total > paging.pageSize && (
          <nav aria-label="Activity pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-sm dark:border-gray-800 md:px-6">
            <span className={mutedClass}>
              Showing rows {shownFrom}-{shownTo} of {paging.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                aria-label="Previous page"
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <span className="tabular-nums text-gray-700 dark:text-gray-300">
                {page + 1} / {lastPage + 1}
              </span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                aria-label="Next page"
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <ChevronLeftIcon className="size-4 rotate-180" />
              </button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
