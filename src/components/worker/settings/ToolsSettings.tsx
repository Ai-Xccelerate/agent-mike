"use client";

import ArtifactsIntegrationCard from "@/components/worker/settings/ArtifactsIntegrationCard";
import AgentDbIntegrationCard from "@/components/worker/settings/AgentDbIntegrationCard";
import AgentWikiIntegrationCard from "@/components/worker/settings/AgentWikiIntegrationCard";
import ExternalToolCard from "@/components/worker/settings/ExternalToolCard";
import type { ExternalTool } from "@/components/worker/settings/ExternalToolCard";
import ParchmentIntegrationCard from "@/components/worker/settings/ParchmentIntegrationCard";
import ScribeIntegrationCard from "@/components/worker/settings/ScribeIntegrationCard";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ToolsConfig } from "@/lib/worker-api";

/**
 * Two kinds of tool live on this screen, and they save differently.
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

/**
 * Third-party systems the worker could connect to, listed before they exist.
 *
 * Placeholders, and nothing more: no credentials are held, no calls are made,
 * and none of them can be switched on. They are here so the shape of what is
 * coming is visible on the screen it will land on, rather than announced
 * somewhere else — each one links to the vendor's own docs.
 */
const EXTERNAL_TOOLS: ExternalTool[] = [
  {
    name: "Nylas",
    description:
      "One connection to a person's real mailbox, calendar and contacts — so the worker can read a thread and put a meeting in the right diary.",
    detail: "Not wired up yet. Read what it covers in the",
    docsUrl: "https://developer.nylas.com/",
    docsLabel: "Nylas developer docs",
  },
  {
    name: "Evermind.ai",
    description:
      "Long-term memory that outlives a single conversation, so the worker remembers what it was told last week without being told again.",
    detail: "Not wired up yet. Read what it covers in the",
    docsUrl: "https://docs.evermind.ai/introduction",
    docsLabel: "Evermind documentation",
  },
];

export default function ToolsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  function toggle(key: keyof ToolsConfig) {
    update("toolsConfig", { ...profile!.toolsConfig, [key]: !profile!.toolsConfig[key] });
  }

  return (
    <>
      <SettingsPageHeader
        title="Tools"
        description="Toggle general-purpose capabilities. Each one is a decoupled, externally-connected integration — never baked into the harness."
        onSave={() => save(["toolsConfig"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">General</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Broad capabilities the worker can draw on. Changes here are saved with the button above.
        </p>
        <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {TOOL_LABELS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <button
                role="switch"
                aria-checked={profile.toolsConfig[key]}
                aria-label={`${profile.toolsConfig[key] ? "Disable" : "Enable"} ${label}`}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                  profile.toolsConfig[key] ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${
                    profile.toolsConfig[key] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Internal tools</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          AI Xccelerate&apos;s own tools, connected with credentials held on the API service. These save as
          soon as you switch them — the button above does not apply to them.
        </p>
        <div className="mt-4 space-y-4">
          <AgentDbIntegrationCard />
          <AgentWikiIntegrationCard />
          <ParchmentIntegrationCard />
          <ScribeIntegrationCard />
          <ArtifactsIntegrationCard />
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">External tools</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Third-party systems this worker could connect to. None of them are connected yet — these
          are placeholders for what is coming, not switches.
        </p>
        <div className="mt-4 space-y-4">
          {EXTERNAL_TOOLS.map((tool) => (
            <ExternalToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      </section>
    </>
  );
}
