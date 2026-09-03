import React from "react";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";

interface ActivityEntry {
  agent: AgentName;
  description: string;
  time: string;
}

const activity: ActivityEntry[] = [
  {
    agent: "Jules",
    description:
      "Booked a demo with Sarah Whitfield, VP Operations at Northgate Supply",
    time: "8 min ago",
  },
  {
    agent: "Pepper",
    description:
      "Qualified an inbound lead from your pricing page and routed it to sales",
    time: "34 min ago",
  },
  {
    agent: "George",
    description:
      "Completed a renewal check-in with Halloway Freight — sentiment positive",
    time: "1 hr ago",
  },
  {
    agent: "Jules",
    description:
      "Followed up with 12 prospects from the Q2 logistics campaign",
    time: "3 hrs ago",
  },
  {
    agent: "Pepper",
    description:
      "Answered 9 product questions in live chat with zero escalations",
    time: "Yesterday",
  },
  {
    agent: "George",
    description:
      "Flagged Dalton Manufacturing as a renewal risk and drafted a save plan",
    time: "Yesterday",
  },
];

export default function ClientActivityTimeline() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Latest activity
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          What your AI workforce has been up to
        </p>
      </div>
      <ul className="space-y-0">
        {activity.map((entry, index) => (
          <li key={`${entry.agent}-${index}`} className="relative flex gap-4">
            <div className="flex flex-col items-center">
              <AgentAvatar name={entry.agent} size="sm" />
              {index < activity.length - 1 && (
                <span className="my-1 w-px flex-1 bg-gray-200 dark:bg-gray-800" />
              )}
            </div>
            <div className="flex-1 pb-6 last:pb-0">
              <p className="text-sm text-gray-800 dark:text-white/90">
                <span className="font-medium">{entry.agent}</span>{" "}
                <span className="text-gray-600 dark:text-gray-300">
                  {entry.description}
                </span>
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {entry.time}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
