import React from "react";

interface PipelineStage {
  stage: string;
  value: string;
  deals: number;
  percentOfMax: number;
}

const stages: PipelineStage[] = [
  { stage: "Discovery", value: "$1.42M", deals: 46, percentOfMax: 100 },
  { stage: "Qualified", value: "$1.08M", deals: 31, percentOfMax: 76 },
  { stage: "Proposal", value: "$764K", deals: 19, percentOfMax: 54 },
  { stage: "Negotiation", value: "$486K", deals: 11, percentOfMax: 34 },
  { stage: "Closing", value: "$291K", deals: 6, percentOfMax: 20 },
];

export default function PipelineByStage() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Pipeline by stage
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Open pipeline across all active deals
        </p>
      </div>
      <ul className="space-y-4">
        {stages.map((stage, index) => (
          <li key={stage.stage}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {stage.stage}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-800 dark:text-white/90">
                  {stage.value}
                </span>{" "}
                · {stage.deals} deals
              </p>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full rounded-full ${
                  index === 0 ? "bg-brand-500" : "bg-brand-300 dark:bg-brand-500/40"
                }`}
                style={{ width: `${stage.percentOfMax}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
