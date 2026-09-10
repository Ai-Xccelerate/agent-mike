"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass, textareaClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

const MODELS = ["gpt-5.6-luna", "gpt-5.6-sol"];

export default function AgentConfigurationSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Agent configuration"
        description="The underlying model and system prompt — exposed and editable without a code deployment (R15)."
        onSave={() => save(["model", "maxAgentTurns", "systemPromptTemplate"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Model</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Model
            <select value={profile.model} onChange={(e) => update("model", e.target.value)} className={`${fieldClass} mt-2`}>
              {MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Max turns per reply
            <input
              type="number"
              min={1}
              max={10}
              value={profile.maxAgentTurns}
              onChange={(e) => update("maxAgentTurns", Number(e.target.value))}
              className={`${fieldClass} mt-2`}
            />
          </label>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">System prompt template</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The raw scaffold, not just the fields around it. Placeholders: <code className="font-mono">{"{{displayName}}"}</code>,{" "}
          <code className="font-mono">{"{{organizationName}}"}</code>, <code className="font-mono">{"{{role}}"}</code>,{" "}
          <code className="font-mono">{"{{tone}}"}</code>.
        </p>
        <textarea
          rows={10}
          value={profile.systemPromptTemplate}
          onChange={(e) => update("systemPromptTemplate", e.target.value)}
          className={`${textareaClass} mt-4 font-mono text-xs`}
        />
      </section>
    </>
  );
}
