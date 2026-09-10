"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ToolsConfig } from "@/lib/worker-api";

const TOOL_LABELS: { key: keyof ToolsConfig; label: string; description: string }[] = [
  { key: "browser_use", label: "Browser use", description: "Navigate and read live web pages." },
  { key: "internet", label: "Internet", description: "General web search." },
  { key: "scribe", label: "Scribe", description: "AI Xccelerate's note-taking tool." },
  { key: "artifacts", label: "Artifacts", description: "Generate and share rich outputs." },
];

export default function ToolsSettingsPage() {
  const { profile, update, save, saving, notice, noticeError } = useWorkerProfile();
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
        saving={saving}
        notice={notice}
        noticeError={noticeError}
      />
      <section className={cardClass}>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {TOOL_LABELS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <button
                role="switch"
                aria-checked={profile.toolsConfig[key]}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
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
    </>
  );
}
