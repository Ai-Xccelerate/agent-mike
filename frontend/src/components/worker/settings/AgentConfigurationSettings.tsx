"use client";

import Link from "next/link";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import {
  cardClass,
  counterClass,
  fieldClass,
  sectionHintClass,
  sectionTitleClass,
  textareaClass,
} from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

const MODELS = ["gpt-5.6-luna", "gpt-5.6-sol"];
const ADDITIONAL_INSTRUCTIONS_MAX_LENGTH = 12000;

/**
 * Mirrors lib/agent.ts's buildIdentityBlock on the backend exactly. Two
 * separate repos, no shared package, so kept in sync by hand. If this ever
 * drifts from that function, the preview below stops telling the truth.
 */
function buildIdentityPreview(displayName: string, organizationName: string, role: string, tone: string) {
  return `You are ${displayName}, an AI worker for ${organizationName}.\nRole: ${role}\nTone: ${tone}`;
}

/** Mirrors lib/agent.ts's jobDescriptionBlock exactly. Same hand-sync note as above. */
function buildJobDescriptionPreview(jobDescription: string | null) {
  return jobDescription ? `\n\nJob description (additional detail on this role):\n${jobDescription}` : "";
}

export default function AgentConfigurationSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Agent configuration"
        description="The model and system prompt this worker uses."
        onSave={() => save(["model", "maxAgentTurns", "systemPromptTemplate"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Model</h2>
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
        <h2 className={sectionTitleClass}>System prompt</h2>
        <p className={sectionHintClass}>
          What the agent actually receives, start to finish. The block below is fixed. It always reflects
          Identity and Role, and can&apos;t be broken by editing text below it.
        </p>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-gray-600 dark:text-gray-400">
            {buildIdentityPreview(profile.displayName, profile.organizationName, profile.role, profile.tone)}
            {buildJobDescriptionPreview(profile.jobDescription)}
          </pre>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Synced from{" "}
            <Link href="/settings/identity" className="underline hover:text-brand-600 dark:hover:text-brand-400">
              Identity
            </Link>{" "}
            and{" "}
            <Link href="/settings/role" className="underline hover:text-brand-600 dark:hover:text-brand-400">
              Role
            </Link>
            . Not editable here.
          </p>
        </div>

        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Additional instructions
          <p className={sectionHintClass}>
            Anything else the agent should follow, appended after the block above.
          </p>
          <AutoGrowTextarea
            minRows={10}
            maxRows={30}
            maxLength={ADDITIONAL_INSTRUCTIONS_MAX_LENGTH}
            value={profile.systemPromptTemplate}
            onChange={(e) => update("systemPromptTemplate", e.target.value)}
            className={`${textareaClass} mt-2 font-mono text-xs`}
          />
        </label>
        <span className={counterClass}>
          {profile.systemPromptTemplate.length}/{ADDITIONAL_INSTRUCTIONS_MAX_LENGTH}
        </span>
      </section>
    </>
  );
}
