"use client";

import type { OverviewStatus, WorkerOverview } from "@/lib/worker-api";

/**
 * The Overview's charts, drawn with plain SVG and CSS so the app takes no chart library. Each one reads the
 * numbers the API already computed; none of them invents a value, and an empty period draws an empty chart.
 */

const mutedClass = "text-sm text-gray-500 dark:text-gray-400";

/** The smallest "round" top for an axis that holds `value`: 1, 2, 5, 10, 20, 50 ... */
export function niceMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

function bucketLabel(iso: string, bucket: "hour" | "day"): string {
  const date = new Date(iso);
  return bucket === "hour"
    ? date.toLocaleTimeString([], { hour: "numeric" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Answered (brand) and handed over (dark) per hour or per day, as stacked columns. */
export function ConversationsOverTime({ series }: { series: WorkerOverview["series"] }) {
  const { points, bucket } = series;
  const width = 640;
  const height = 220;
  const left = 34;
  const bottom = 26;
  const top = 8;
  const plotWidth = width - left - 4;
  const plotHeight = height - bottom - top;
  const peak = niceMax(Math.max(0, ...points.map((point) => point.answered + point.handedOver)));
  const slot = plotWidth / Math.max(1, points.length);
  const barWidth = Math.max(2, slot * 0.62);
  const everyNth = Math.max(1, Math.ceil(points.length / 6));
  const total = points.reduce((sum, point) => sum + point.answered + point.handedOver, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Conversations per ${bucket}: ${points.map((point) => `${bucketLabel(point.start, bucket)} ${point.answered} answered, ${point.handedOver} handed over`).join("; ")}`}
        className="h-auto w-full"
      >
        {[0, 0.5, 1].map((fraction) => {
          const y = top + plotHeight * (1 - fraction);
          return (
            <g key={fraction}>
              <line x1={left} x2={width - 4} y1={y} y2={y} className="stroke-gray-200 dark:stroke-gray-800" strokeWidth={1} />
              <text x={left - 6} y={y + 4} textAnchor="end" className="fill-gray-500 text-[10px] dark:fill-gray-400">
                {Math.round(peak * fraction * 10) / 10}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const x = left + index * slot + (slot - barWidth) / 2;
          const handedHeight = (point.handedOver / peak) * plotHeight;
          const answeredHeight = (point.answered / peak) * plotHeight;
          const base = top + plotHeight;
          return (
            <g key={point.start}>
              <title>{`${bucketLabel(point.start, bucket)}: ${point.answered} answered, ${point.handedOver} handed over`}</title>
              <rect x={x} y={base - answeredHeight} width={barWidth} height={answeredHeight} className="fill-brand-500" />
              <rect x={x} y={base - answeredHeight - handedHeight} width={barWidth} height={handedHeight} className="fill-gray-700 dark:fill-gray-300" />
              {index % everyNth === 0 && (
                <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="fill-gray-500 text-[10px] dark:fill-gray-400">
                  {bucketLabel(point.start, bucket)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-brand-500" aria-hidden="true" /> Answered without a person
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-gray-700 dark:bg-gray-300" aria-hidden="true" /> Handed to a person
        </span>
        {total === 0 && <span className={mutedClass}>No conversations in this period.</span>}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<OverviewStatus, { label: string; stroke: string; dot: string }> = {
  open: { label: "Open", stroke: "stroke-blue-light-500", dot: "bg-blue-light-500" },
  needs_human: { label: "Needs a person", stroke: "stroke-warning-500", dot: "bg-warning-500" },
  resolved: { label: "Resolved", stroke: "stroke-success-500", dot: "bg-success-500" },
  closed: { label: "Closed", stroke: "stroke-gray-400", dot: "bg-gray-400" },
};

/** Conversation status in the period, as a ring with the total in the middle. */
export function StatusDonut({ byStatus }: { byStatus: WorkerOverview["byStatus"] }) {
  const total = byStatus.reduce((sum, entry) => sum + entry.count, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 140 140"
        role="img"
        aria-label={byStatus.map((entry) => `${STATUS_STYLE[entry.status].label} ${entry.count}`).join(", ")}
        className="size-36 shrink-0"
      >
        <circle cx={70} cy={70} r={radius} fill="none" strokeWidth={16} className="stroke-gray-100 dark:stroke-white/5" />
        {total > 0 &&
          byStatus.map((entry) => {
            if (!entry.count) return null;
            const length = (entry.count / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const start = offset;
            offset += length;
            return (
              <circle
                key={entry.status}
                cx={70}
                cy={70}
                r={radius}
                fill="none"
                strokeWidth={16}
                strokeDasharray={dash}
                strokeDashoffset={-start}
                transform="rotate(-90 70 70)"
                className={STATUS_STYLE[entry.status].stroke}
              />
            );
          })}
        <text x={70} y={68} textAnchor="middle" className="fill-gray-800 text-[26px] font-semibold dark:fill-white/90">
          {total}
        </text>
        <text x={70} y={86} textAnchor="middle" className="fill-gray-500 text-[10px] dark:fill-gray-400">
          conversations
        </text>
      </svg>
      <ul className="space-y-2 text-sm">
        {byStatus.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className={`size-2.5 rounded-full ${STATUS_STYLE[entry.status].dot}`} aria-hidden="true" />
            {STATUS_STYLE[entry.status].label}
            <span className="font-semibold tabular-nums text-gray-800 dark:text-white/90">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Priorities come in the helpdesk's own order, most urgent first: red and amber for the two most urgent, then greys.
const PRIORITY_COLORS = ["bg-error-500", "bg-warning-500", "bg-gray-500", "bg-gray-400", "bg-gray-300 dark:bg-gray-600"];

/** One column per priority, in the helpdesk's order. */
export function PriorityColumns({ byPriority }: { byPriority: WorkerOverview["tickets"]["byPriority"] }) {
  const peak = niceMax(Math.max(0, ...byPriority.map((entry) => entry.count)));
  return (
    <div
      role="img"
      aria-label={byPriority.map((entry) => `${entry.name} ${entry.count}`).join(", ")}
      className="grid items-end gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, byPriority.length)}, minmax(0, 1fr))` }}
    >
      {byPriority.map((entry, index) => (
        <div key={entry.name} className="mx-auto flex w-full max-w-24 flex-col items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">{entry.count}</span>
          <div className="flex h-28 w-full items-end rounded-md bg-gray-50 dark:bg-white/[0.03]">
            <div
              className={`w-full rounded-md ${PRIORITY_COLORS[Math.min(index, PRIORITY_COLORS.length - 1)]}`}
              style={{ height: `${entry.count ? Math.max(6, (entry.count / peak) * 100) : 0}%` }}
            />
          </div>
          <span className="text-center text-xs text-gray-600 dark:text-gray-300">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}

/** A horizontal bar per label, for request types and for the most-used articles. */
export function CountBars({
  rows,
  empty,
  labelTrack = "minmax(0, 12rem)",
}: {
  rows: { name: string; count: number }[];
  empty: string;
  /** The label column's grid track: request types are short, article titles are not. */
  labelTrack?: string;
}) {
  const peak = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className={mutedClass}>{empty}</p>;
  return (
    <dl className="grid items-center gap-x-3 gap-y-2.5 text-sm" style={{ gridTemplateColumns: `${labelTrack} minmax(0, 1fr) 2rem` }}>
      {rows.map((row) => (
        <div key={row.name} className="contents">
          <dt className={`truncate ${row.count ? "text-gray-800 dark:text-white/90" : "text-gray-500 dark:text-gray-400"}`} title={row.name}>
            {row.name}
          </dt>
          <dd className="h-2 rounded-full bg-gray-100 dark:bg-white/5" aria-hidden="true">
            <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${(row.count / peak) * 100}%` }} />
          </dd>
          <dd className="text-right font-semibold tabular-nums text-gray-800 dark:text-white/90">{row.count}</dd>
        </div>
      ))}
    </dl>
  );
}
