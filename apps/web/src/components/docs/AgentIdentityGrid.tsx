import React from "react";
import AgentAvatar, { AGENT_META, AgentName } from "@/components/aix/AgentAvatar";

const AGENT_ORDER: AgentName[] = [
  "Nick",
  "Jules",
  "Pepper",
  "Tony",
  "Joy",
  "George",
];

export default function AgentIdentityGrid() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
        {AGENT_ORDER.map((name) => (
          <div
            key={name}
            className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 p-4 transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
          >
            <AgentAvatar name={name} size="lg" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {AGENT_META[name].role}
              </p>
              <p className="mt-1 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {AGENT_META[name].hex}
              </p>
            </div>
          </div>
        ))}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 p-4 transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700">
          <span className="flex size-14 items-center justify-center rounded-full bg-agent-sam text-lg font-bold text-white">
            S
          </span>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Sam
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chief of staff
            </p>
            <p className="mt-1 font-mono text-[11px] text-gray-500 dark:text-gray-400">
              #0EA5E9
            </p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Canonical identity colors — do not improvise new hues. Use{" "}
        <span className="font-mono text-xs">AgentAvatar</span> +{" "}
        <span className="font-mono text-xs">AGENT_META</span> from{" "}
        <span className="font-mono text-xs">
          src/components/aix/AgentAvatar.tsx
        </span>
        ; never hardcode.
      </p>
    </div>
  );
}
