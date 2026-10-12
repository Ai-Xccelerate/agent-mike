"use client";

import { useWorkerIdentityDisplay } from "@/context/WorkerIdentityContext";
import { apiFetch, type OverviewPeriod, type OverviewRecentOutcome, type WorkerOverview } from "@/lib/worker-api";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The Overview: how much customer traffic this worker had, how much it
 * answered itself, what it handed to the team (broken down by the connected
 * helpdesk's own request types and priorities), and what it did lately. The
 * numbers come from /worker/overview; nothing here knows any one customer's
 * helpdesk.
 */

const PERIODS: { id: OverviewPeriod; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const cardClass = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";
const headingClass = "text-base font-semibold text-gray-800 dark:text-white/90";
const mutedClass = "text-sm text-gray-500 dark:text-gray-400";

// Priorities come in the helpdesk's own order, most urgent first.
// Red and amber for the two most urgent, then greys: orange stays the brand accent.
const PRIORITY_COLORS = ["bg-error-500", "bg-warning-500", "bg-gray-500", "bg-gray-400", "bg-gray-300 dark:bg-gray-600"];

function timeOfDay(iso: string, period: OverviewPeriod) {
  const date = new Date(iso);
  return period === "24h"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function channelLine(byChannel: Record<string, number>) {
  const parts = Object.entries(byChannel).map(([channel, count]) => `${channel} ${count}`);
  return parts.length ? parts.join(" · ") : "No customer conversations yet";
}

function Stat({ label, value, note }: { label: string; value: string; note: React.ReactNode }) {
  return (
    <div className={`${cardClass} flex flex-col gap-1 p-5 md:p-6`}>
      <span className={mutedClass}>{label}</span>
      <span className="font-display text-3xl font-semibold tabular-nums text-gray-800 dark:text-white/90">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{note}</span>
    </div>
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
  const [overview, setOverview] = useState<WorkerOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const { displayName } = useWorkerIdentityDisplay("This worker");

  useEffect(() => {
    let cancelled = false;
    apiFetch<WorkerOverview>(`/worker/overview?period=${period}`)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const total = overview?.conversations.total ?? 0;
  const answered = overview?.answeredByWorker ?? 0;
  const answeredPct = total ? Math.round((answered / total) * 100) : 0;
  const helpdesk = overview?.tickets.helpdesk ?? null;
  const target = overview?.firstReply.targetHours ?? null;
  const maxType = Math.max(1, ...(overview?.tickets.byType.map((entry) => entry.count) ?? [1]));
  const priorityTotal = overview?.tickets.byPriority.reduce((sum, entry) => sum + entry.count, 0) ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-gray-800 dark:text-white/90">Overview</h1>
          <p className={mutedClass}>What {displayName} handled, and what it passed to your team.</p>
        </div>
        <div role="group" aria-label="Period" className="flex gap-2">
          {PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={period === entry.id}
              onClick={() => setPeriod(entry.id)}
              className={`rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                period === entry.id
                  ? "border-brand-500 bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      {failed && (
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          Couldn&apos;t load the numbers. Try again in a moment.
        </p>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <Stat label="Conversations" value={overview ? String(total) : "…"} note={overview ? channelLine(overview.conversations.byChannel) : ""} />
        <Stat
          label={`Answered by ${displayName}`}
          value={overview ? `${answeredPct}%` : "…"}
          note={overview ? `${answered} of ${total}, without a person` : ""}
        />
        <Stat
          label={helpdesk ? "Tickets raised" : "Handed to your team"}
          value={overview ? String(helpdesk ? overview.tickets.raised : overview.handedOver) : "…"}
          note={helpdesk ? `in ${helpdesk.project}` : "waiting for a person in the Inbox"}
        />
        <Stat
          label="First reply within target"
          value="Not measured yet"
          note={
            <>
              {target ? `Target: ${target} ${target === 1 ? "hour" : "hours"}. ` : "No target set. "}
              <Link href="/settings/manager" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                {target ? "Change" : "Set one"}
              </Link>
              {helpdesk ? ". Reply times come from your helpdesk." : ""}
            </>
          }
        />
      </section>

      {helpdesk ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 md:gap-6">
          <section aria-labelledby="by-type" className={`${cardClass} p-5 md:p-6`}>
            <h2 id="by-type" className={headingClass}>Tickets by request type</h2>
            <p className={mutedClass}>The request types of your connected service desk ({helpdesk.project}).</p>
            <dl className="mt-4 grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-2.5 text-sm">
              {overview?.tickets.byType.map((entry) => (
                <div key={entry.name} className="contents">
                  <dt className={entry.count ? "text-gray-800 dark:text-white/90" : "text-gray-500 dark:text-gray-400"}>{entry.name}</dt>
                  <dd className="h-2 rounded-full bg-gray-100 dark:bg-white/5" aria-hidden="true">
                    <span className="block h-2 rounded-full bg-gray-700 dark:bg-gray-300" style={{ width: `${(entry.count / maxType) * 100}%` }} />
                  </dd>
                  <dd className="text-right font-semibold tabular-nums text-gray-800 dark:text-white/90">{entry.count}</dd>
                </div>
              ))}
              {!overview?.tickets.byType.length && <p className={`${mutedClass} col-span-3`}>No tickets in this period.</p>}
            </dl>
          </section>

          <section aria-labelledby="by-priority" className={`${cardClass} p-5 md:p-6`}>
            <h2 id="by-priority" className={headingClass}>By priority</h2>
            <p className={mutedClass}>Your service desk&apos;s priorities. {displayName} sets them from the impact the customer describes.</p>
            <div
              role="img"
              aria-label={overview?.tickets.byPriority.map((entry) => `${entry.name} ${entry.count}`).join(", ")}
              className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"
            >
              {overview?.tickets.byPriority.map((entry, index) =>
                entry.count ? (
                  <span
                    key={entry.name}
                    className={PRIORITY_COLORS[Math.min(index, PRIORITY_COLORS.length - 1)]}
                    style={{ width: `${(entry.count / Math.max(1, priorityTotal)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {overview?.tickets.byPriority.map((entry, index) => (
                <li key={entry.name} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className={`size-2 rounded-full ${PRIORITY_COLORS[Math.min(index, PRIORITY_COLORS.length - 1)]}`} aria-hidden="true" />
                  {entry.name} {entry.count}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <section aria-labelledby="topics" className={`${cardClass} p-5 md:p-6`}>
          <h2 id="topics" className={headingClass}>Handed over by topic</h2>
          <p className={mutedClass}>
            Connect a helpdesk under{" "}
            <Link href="/settings/integrations" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              Integrations
            </Link>{" "}
            to see these by request type and priority.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            {overview?.handedOverTopics.map((topic) => <li key={topic}>{topic}</li>)}
            {overview && !overview.handedOverTopics.length && <li className={mutedClass}>Nothing handed over in this period.</li>}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent" className={`${cardClass} flex flex-col`}>
        <div className="flex items-center justify-between px-5 pt-5 md:px-6">
          <h2 id="recent" className={headingClass}>Recent activity</h2>
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
              No customer conversations in this period. They appear here once someone writes in over the website widget or email.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
