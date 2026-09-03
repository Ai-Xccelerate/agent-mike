import React from "react";
import AgentAvatar, {
  AGENT_META,
  AgentName,
} from "@/components/aix/AgentAvatar";
import Badge from "@/components/ui/badge/Badge";

interface RosterAgent {
  name: AgentName;
  conversations: number;
  status: "active" | "training";
}

const roster: RosterAgent[] = [
  { name: "Nick", conversations: 342, status: "active" },
  { name: "Jules", conversations: 289, status: "active" },
  { name: "Pepper", conversations: 261, status: "active" },
  { name: "Tony", conversations: 178, status: "active" },
  { name: "Joy", conversations: 134, status: "active" },
  { name: "George", conversations: 80, status: "training" },
];

export default function AgentRoster() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Agent roster
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All 6 AI revenue employees
        </p>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {roster.map((agent) => (
          <li
            key={agent.name}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <AgentAvatar
              name={agent.name}
              size="md"
              showStatus
              status={agent.status}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {agent.name}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {AGENT_META[agent.name].role}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {agent.conversations.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                conversations
              </p>
            </div>
            <Badge
              size="sm"
              variant="light"
              color={agent.status === "active" ? "success" : "warning"}
            >
              {agent.status === "active" ? "Active" : "Training"}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
