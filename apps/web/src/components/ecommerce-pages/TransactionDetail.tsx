import React from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ArrowRightIcon, PageIcon } from "@/icons";

interface TimelineEvent {
  label: string;
  timestamp: string;
  detail: string;
}

const timeline: TimelineEvent[] = [
  {
    label: "Created",
    timestamp: "Jun 28, 9:41 AM",
    detail: "Payment intent created for INV-2026-0042",
  },
  {
    label: "Authorized",
    timestamp: "Jun 28, 9:41 AM",
    detail: "Visa •••• 4421 authorized for $12,150.00",
  },
  {
    label: "Captured",
    timestamp: "Jun 28, 9:42 AM",
    detail: "Full amount captured by processor",
  },
  {
    label: "Settled",
    timestamp: "Jun 30, 6:15 AM",
    detail: "Funds settled to operating account",
  },
];

const details: { label: string; value: React.ReactNode }[] = [
  {
    label: "Transaction ID",
    value: (
      <span className="font-mono text-sm text-gray-800 dark:text-white/90">
        TXN-9F3A21
      </span>
    ),
  },
  { label: "Client", value: "Meridian Logistics" },
  { label: "Payment method", value: "Visa •••• 4421" },
  {
    label: "Invoice",
    value: (
      <Link
        href="/invoice-detail"
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 hover:text-gray-800 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
      >
        INV-2026-0042
        <ArrowRightIcon className="size-3.5" />
      </Link>
    ),
  },
  { label: "Processor fee", value: "$352.35" },
  { label: "Net amount", value: "$11,797.65" },
];

export default function TransactionDetail() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-3">
      {/* Left: summary + details + timeline */}
      <div className="space-y-5 sm:space-y-6 lg:col-span-2">
        {/* Summary header */}
        <div
          data-aix-id="AIX-057.1"
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Payment from Meridian Logistics
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-white/90 md:text-4xl">
                  $12,150.00
                </h3>
                <Badge size="sm" color="success">
                  Settled
                </Badge>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Jun 28, 2026 · 9:42 AM CST
            </p>
          </div>

          {/* Detail grid */}
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-gray-200 pt-6 dark:border-gray-800 sm:grid-cols-2 md:grid-cols-3">
            {details.map((d) => (
              <div key={d.label}>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {d.label}
                </p>
                <div className="mt-1.5 text-sm font-medium text-gray-800 dark:text-white/90">
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div
          data-aix-id="AIX-057.2"
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Timeline
          </h3>
          <ol className="mt-5">
            {timeline.map((event, i) => {
              const isLast = i === timeline.length - 1;
              return (
                <li key={event.label} className="relative flex gap-4 pb-8 last:pb-0">
                  {/* vertical line */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-[7px] top-5 h-full w-px bg-gray-200 dark:bg-gray-800"
                    />
                  )}
                  {/* dot */}
                  <span
                    className={`relative mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-full border-2 ${
                      isLast
                        ? "border-brand-500 bg-brand-500"
                        : "border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        {event.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {event.timestamp}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {event.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Right: related invoice + actions */}
      <div data-aix-id="AIX-057.3" className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Related invoice
          </h3>
          <Link
            href="/invoice-detail"
            className="mt-4 flex items-center gap-4 rounded-xl bg-gray-50 p-4 transition-colors duration-150 hover:bg-gray-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
              <PageIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                INV-2026-0042
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                3 agent seats + onboarding · $12,150.00
              </p>
            </div>
            <ArrowRightIcon className="size-4 shrink-0 text-gray-400" />
          </Link>
          <p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">
            This payment settles the invoice in full. No balance remains.
          </p>
          <div className="mt-5">
            <Button size="sm" variant="outline" className="w-full">
              Refund payment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
