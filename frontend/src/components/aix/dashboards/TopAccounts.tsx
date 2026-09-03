import React from "react";
import ProgressBar from "@/components/ui/progress/ProgressBar";

interface TopAccount {
  name: string;
  segment: string;
  pipeline: string;
  percentOfMax: number;
}

const accounts: TopAccount[] = [
  {
    name: "Meridian Logistics",
    segment: "Supply chain",
    pipeline: "$412K",
    percentOfMax: 100,
  },
  {
    name: "Corewave Systems",
    segment: "Manufacturing",
    pipeline: "$318K",
    percentOfMax: 77,
  },
  {
    name: "Brightpath Medical",
    segment: "Healthcare",
    pipeline: "$276K",
    percentOfMax: 67,
  },
  {
    name: "Trellis Freight",
    segment: "Transportation",
    pipeline: "$194K",
    percentOfMax: 47,
  },
  {
    name: "Fairmont Industrial",
    segment: "Distribution",
    pipeline: "$151K",
    percentOfMax: 37,
  },
];

export default function TopAccounts() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Top accounts
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          By agent-influenced pipeline this quarter
        </p>
      </div>
      <ul className="space-y-5">
        {accounts.map((account) => (
          <li key={account.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {account.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {account.segment}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-gray-800 dark:text-white/90">
                {account.pipeline}
              </span>
            </div>
            <ProgressBar value={account.percentOfMax} size="sm" color="brand" />
          </li>
        ))}
      </ul>
    </div>
  );
}
