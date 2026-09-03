import React from "react";

interface Topic {
  name: string;
  answers: number;
  share: number; // percent of total, drives the bar
}

const topics: Topic[] = [
  { name: "API authentication & keys", answers: 486, share: 26 },
  { name: "Webhook configuration", answers: 342, share: 18 },
  { name: "CRM sync errors", answers: 289, share: 15 },
  { name: "SSO / SAML setup", answers: 244, share: 13 },
  { name: "Rate limits & quotas", answers: 197, share: 11 },
  { name: "Data export formats", answers: 168, share: 9 },
];

export default function TopTopicsPanel() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Top documented topics
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Where Tony&apos;s answers came from this month
      </p>
      <ul className="mt-5 flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        {topics.map((topic) => (
          <li key={topic.name} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {topic.name}
              </p>
              <p className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                {topic.answers.toLocaleString()}
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-1.5 rounded-full bg-theme-purple-500"
                style={{ width: `${topic.share}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
