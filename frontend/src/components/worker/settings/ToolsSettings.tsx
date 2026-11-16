"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/icons";
import ArtifactsIntegrationCard from "@/components/worker/settings/ArtifactsIntegrationCard";
import AgentDbIntegrationCard from "@/components/worker/settings/AgentDbIntegrationCard";
import AgentWikiIntegrationCard from "@/components/worker/settings/AgentWikiIntegrationCard";
import ParchmentIntegrationCard from "@/components/worker/settings/ParchmentIntegrationCard";
import ScribeIntegrationCard from "@/components/worker/settings/ScribeIntegrationCard";
import DirectoryHeading from "@/components/worker/settings/DirectoryHeading";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { dividerClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import { apiFetch, type ToolsConfig, type WorkerProfile } from "@/lib/worker-api";

/**
 * Two kinds of tool live on this screen (Settings > Connections > Tools), and they save differently. The mailbox moved to
 * Connections > Email.
 *
 * General capabilities are plain flags on the worker profile, so they follow
 * the page's dirty/save/discard header like every other settings form.
 *
 * Internal tools are separately connected systems with their own credentials
 * and endpoints. They cannot be staged behind this page's Save without
 * pretending a connection is a form field, so each card saves itself when its
 * controls are used. The section says so rather than leaving that ambiguous.
 */
const TOOL_LABELS: { key: keyof ToolsConfig; label: string; description: string }[] = [
  { key: "browser_use", label: "Browser use", description: "Navigate and read live web pages." },
  { key: "internet_search", label: "Internet", description: "General web search." },
];

export default function ToolsSettings() {
  const { profile, update, applyServerUpdate } = useWorkerProfile();
  const [error, setError] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const [savingKey, setSavingKey] = useState<keyof ToolsConfig | null>(null);
  if (!profile) return null;

  // A switch saves when it is flipped, like the internal tools below: the page has no Save button to stage it behind.
  async function toggle(key: keyof ToolsConfig) {
    const before = profile!.toolsConfig;
    const next = { ...before, [key]: !before[key] };
    setError("");
    setSavingKey(key);
    update("toolsConfig", next);
    try {
      const saved = await apiFetch<WorkerProfile>("/worker", { method: "PATCH", body: JSON.stringify({ toolsConfig: next }) });
      applyServerUpdate(saved, ["toolsConfig"]);
    } catch {
      update("toolsConfig", before);
      setError("Could not save. Check that the API is running.");
    } finally {
      setSavingKey(null);
    }
  }

  const on = TOOL_LABELS.filter(({ key }) => profile.toolsConfig[key]).length;

  return (
    <div className="space-y-3">
      <DirectoryHeading
        id="connections-tools"
        title="Tools"
        count={`${on} of ${TOOL_LABELS.length} general on`}
        hint="Capabilities you switch on or off. Nothing to sign in to. Each switch saves when you flip it."
      />
      <div className="rounded-2xl border border-gray-300/70 bg-white dark:border-gray-800 dark:bg-white/[0.03]" data-aix-id="AIX-163.1">
        <div className="px-5 pb-1 pt-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">General</h3>
          <div className={dividerClass}>
            {TOOL_LABELS.map(({ key, label, description }) => (
              <SettingsToggleRow
                key={key}
                title={label}
                description={description}
                checked={profile.toolsConfig[key]}
                disabled={savingKey !== null}
                onChange={() => void toggle(key)}
              />
            ))}
          </div>
          {error && (
            <p role="alert" className="pb-3 text-xs font-medium text-error-600 dark:text-error-400">
              {error}
            </p>
          )}
        </div>
        <div className="border-t border-gray-300/70 dark:border-gray-800" data-aix-id="AIX-163.2">
          <button
            type="button"
            aria-expanded={internalOpen}
            aria-controls="connections-internal-tools"
            onClick={() => setInternalOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-4 rounded-b-2xl px-5 py-4 text-left transition-colors duration-150 ease-out hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 dark:hover:bg-white/[0.03]"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                Internal tools
                <span className="ml-2 text-xs font-normal tabular-nums text-gray-500 dark:text-gray-400">5</span>
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">AI Xccelerate&apos;s own built-in tools.</span>
            </span>
            <ChevronDownIcon className={`size-5 shrink-0 text-gray-500 transition-transform duration-150 ease-out dark:text-gray-400 ${internalOpen ? "rotate-180" : ""}`} />
          </button>
          {internalOpen && (
            <div id="connections-internal-tools" className="space-y-4 px-5 pb-5">
              <AgentDbIntegrationCard />
              <AgentWikiIntegrationCard />
              <ParchmentIntegrationCard />
              <ScribeIntegrationCard />
              <ArtifactsIntegrationCard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
