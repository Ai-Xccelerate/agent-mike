import React from "react";
import Badge from "@/components/ui/badge/Badge";

type Stage = "Discovery" | "Proposal" | "Negotiation" | "Legal review";

interface StuckDeal {
  deal: string;
  stage: Stage;
  daysStuck: number;
}

const deals: StuckDeal[] = [
  { deal: "Meridian Logistics — expansion", stage: "Legal review", daysStuck: 14 },
  { deal: "Bluepeak Software — platform", stage: "Negotiation", daysStuck: 11 },
  { deal: "Crestline Manufacturing — pilot", stage: "Proposal", daysStuck: 9 },
  { deal: "Orchard Supply Group — renewal+", stage: "Negotiation", daysStuck: 7 },
  { deal: "Halvorsen Medical — new logo", stage: "Discovery", daysStuck: 6 },
  { deal: "Tarrant Freight — add-on seats", stage: "Proposal", daysStuck: 5 },
];

const stageColor: Record<Stage, "info" | "warning" | "error" | "light"> = {
  Discovery: "light",
  Proposal: "info",
  Negotiation: "warning",
  "Legal review": "error",
};

function stuckTone(days: number): string {
  if (days >= 10) return "text-error-600 dark:text-error-500";
  if (days >= 7) return "text-warning-600 dark:text-orange-400";
  return "text-gray-500 dark:text-gray-400";
}

export default function DealsAttentionPanel() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Deals needing attention
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Stalled past stage benchmarks — Joy has nudged each owner
      </p>
      <ul className="mt-5 flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        {deals.map((deal) => (
          <li
            key={deal.deal}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {deal.deal}
              </p>
              <div className="mt-1">
                <Badge size="sm" color={stageColor[deal.stage]}>
                  {deal.stage}
                </Badge>
              </div>
            </div>
            <p
              className={`shrink-0 text-sm font-medium ${stuckTone(deal.daysStuck)}`}
            >
              {deal.daysStuck}d stuck
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
