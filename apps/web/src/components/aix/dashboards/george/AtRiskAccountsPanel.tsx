import React from "react";

interface AtRiskAccount {
  account: string;
  healthScore: number;
  renewal: string;
}

const accounts: AtRiskAccount[] = [
  { account: "Tarrant Freight", healthScore: 34, renewal: "Jul 28, 2026" },
  { account: "Halvorsen Medical", healthScore: 41, renewal: "Aug 12, 2026" },
  { account: "Orchard Supply Group", healthScore: 46, renewal: "Sep 3, 2026" },
  { account: "Bluepeak Software", healthScore: 52, renewal: "Aug 30, 2026" },
  { account: "Crestline Manufacturing", healthScore: 55, renewal: "Oct 15, 2026" },
  { account: "Kessler & Boyd LLP", healthScore: 58, renewal: "Nov 2, 2026" },
];

function scoreDot(score: number): string {
  if (score < 40) return "bg-error-500";
  if (score < 55) return "bg-warning-500";
  return "bg-gray-400";
}

function scoreTone(score: number): string {
  if (score < 40) return "text-error-600 dark:text-error-500";
  if (score < 55) return "text-warning-600 dark:text-warning-400";
  return "text-gray-500 dark:text-gray-400";
}

export default function AtRiskAccountsPanel() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        At-risk accounts
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Health below 60 — George has opened a save play for each
      </p>
      <ul className="mt-5 flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        {accounts.map((acct) => (
          <li
            key={acct.account}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {acct.account}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Renews {acct.renewal}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-medium ${scoreTone(acct.healthScore)}`}
            >
              <span
                className={`size-2 rounded-full ${scoreDot(acct.healthScore)}`}
              />
              {acct.healthScore}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
