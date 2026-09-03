import React from "react";
import Link from "next/link";
import AgentAvatar, {
  AGENT_META,
  AgentName,
} from "@/components/aix/AgentAvatar";

interface DeployedAgent {
  name: AgentName;
  stats: { label: string; value: string }[];
}

const deployed: DeployedAgent[] = [
  {
    name: "Jules",
    stats: [
      { label: "Conversations", value: "94" },
      { label: "Meetings booked", value: "5" },
    ],
  },
  {
    name: "Pepper",
    stats: [
      { label: "Conversations", value: "78" },
      { label: "Leads qualified", value: "23" },
    ],
  },
  {
    name: "George",
    stats: [
      { label: "Conversations", value: "42" },
      { label: "Renewals secured", value: "3" },
    ],
  },
];

export default function DeployedAgents() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Your agents
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          3 AI revenue employees deployed on your account
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {deployed.map((agent) => (
          <div
            key={agent.name}
            className="rounded-xl bg-gray-50 p-5 transition-colors duration-150 dark:bg-white/[0.03]"
          >
            <div className="flex items-center gap-4">
              <AgentAvatar name={agent.name} size="lg" showStatus />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
                  {agent.name}
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {AGENT_META[agent.name].role}
                </p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              {agent.stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold tracking-tight text-gray-800 dark:text-white/90">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              href="#"
              className="mt-4 inline-flex items-center text-sm font-medium text-brand-500 transition-colors duration-150 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500/50"
            >
              View activity
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
