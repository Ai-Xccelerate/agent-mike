import React from "react";

interface Sequence {
  name: string;
  persona: string;
  replyRate: number;
  contacts: number;
}

const sequences: Sequence[] = [
  { name: "VP Ops — cost of manual work", persona: "VP Operations", replyRate: 12.4, contacts: 640 },
  { name: "CFO — headcount vs. AI worker", persona: "CFO", replyRate: 10.8, contacts: 512 },
  { name: "RevOps — pipeline coverage gap", persona: "RevOps lead", replyRate: 9.1, contacts: 488 },
  { name: "CEO — scale without hiring", persona: "Founder / CEO", replyRate: 7.6, contacts: 431 },
  { name: "Sales dir — SDR follow-up lag", persona: "Sales director", replyRate: 6.2, contacts: 396 },
];

const maxRate = Math.max(...sequences.map((s) => s.replyRate));

export default function BestSequences() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Best performing sequences
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          By reply rate, last 30 days
        </p>
      </div>
      <ul className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
        {sequences.map((sequence) => (
          <li key={sequence.name} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {sequence.name}
              </p>
              <span className="shrink-0 text-sm font-semibold text-gray-800 dark:text-white/90">
                {sequence.replyRate.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(sequence.replyRate / maxRate) * 100}%`,
                  backgroundColor: "#3B82F6",
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {sequence.persona} · {sequence.contacts.toLocaleString()} contacts
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
