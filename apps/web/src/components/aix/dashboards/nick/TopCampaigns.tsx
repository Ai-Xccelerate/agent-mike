import React from "react";

interface Campaign {
  name: string;
  channel: string;
  leads: number;
  goal: number;
}

const campaigns: Campaign[] = [
  { name: "Mid-market CFO outreach", channel: "LinkedIn", leads: 486, goal: 500 },
  { name: "Warehouse ops webinar", channel: "Webinar", leads: 392, goal: 450 },
  { name: "AI readiness assessment", channel: "Landing page", leads: 348, goal: 400 },
  { name: "Distribution ERP switchers", channel: "Paid search", leads: 271, goal: 350 },
  { name: "Field services newsletter", channel: "Email", leads: 214, goal: 300 },
];

export default function TopCampaigns() {
  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Top campaigns
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Lead volume vs. monthly goal
        </p>
      </div>
      <ul className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
        {campaigns.map((campaign) => {
          const pct = Math.round((campaign.leads / campaign.goal) * 100);
          return (
            <li key={campaign.name} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {campaign.name}
                </p>
                <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                  {campaign.leads.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                  {pct}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {campaign.channel}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
