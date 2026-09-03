import React from "react";
import AgentAvatar, { AGENT_META, AgentName } from "../AgentAvatar";
import Badge from "@/components/ui/badge/Badge";

type AgentStatus = "active" | "training" | "paused";

interface AgentHeroProps {
  name: AgentName;
  tagline: string;
  stats: { label: string; value: string }[];
  status?: AgentStatus;
}

const statusBadgeColor: Record<
  AgentStatus,
  "success" | "warning" | "light"
> = {
  active: "success",
  training: "warning",
  paused: "light",
};

const statusLabel: Record<AgentStatus, string> = {
  active: "Active",
  training: "Training",
  paused: "Paused",
};

export default function AgentHero({
  name,
  tagline,
  stats,
  status = "active",
}: AgentHeroProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <AgentAvatar name={name} size="lg" showStatus status={status} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {name}
              </h1>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {AGENT_META[name].role}
              </span>
              <Badge size="sm" color={statusBadgeColor[status]}>
                {statusLabel[status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {tagline}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 sm:gap-8">
          {stats.map((stat, index) => (
            <React.Fragment key={stat.label}>
              {index > 0 && (
                <span className="h-9 w-px bg-gray-200 dark:bg-gray-800" />
              )}
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-gray-800 dark:text-white/90">
                  {stat.value}
                </p>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
