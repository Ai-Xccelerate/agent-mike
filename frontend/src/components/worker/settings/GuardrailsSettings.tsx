"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import UserVerificationToggle from "@/components/worker/settings/UserVerificationToggle";
import { cardClass, fieldClass, sectionHintClass, sectionTitleClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function GuardrailsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Guardrails"
        description="Checks that run before the model responds. Low-confidence answers are never sent automatically."
        onSave={() =>
          save(["confidenceThreshold", "escalationTerms", "allowedDomains", "requireUserVerification", "assistantActionsEnabled"])
        }
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Confidence &amp; escalation</h2>
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum confidence</label>
            <code className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
              {Math.round(profile.confidenceThreshold * 100)}%
            </code>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={profile.confidenceThreshold}
            onChange={(e) => update("confidenceThreshold", Number(e.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-500 dark:bg-gray-800"
          />
          <div className="mt-2 flex justify-between text-[11px] text-gray-500">
            <span>More autonomous</span>
            <span>More review</span>
          </div>
        </div>
        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Escalation phrases
          <input
            value={profile.escalationTerms.join(", ")}
            onChange={(e) => update("escalationTerms", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            className={`${fieldClass} mt-2`}
          />
          <span className="mt-1.5 block text-xs font-normal text-gray-500">Comma-separated. Matches are case-insensitive.</span>
        </label>
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Domain &amp; user restriction</h2>
        <p className={sectionHintClass}>
          A standard, foundation-level feature, not something built per worker. Leave empty to allow any sender.
        </p>
        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Allowed email domains
          <input
            value={profile.allowedDomains.join(", ")}
            onChange={(e) => update("allowedDomains", e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))}
            placeholder="e.g. acme.com, acme.io"
            className={`${fieldClass} mt-2`}
          />
        </label>
        <UserVerificationToggle
          checked={profile.requireUserVerification}
          onChange={(next) => update("requireUserVerification", next)}
        />
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Admin assistant</h2>
        <p className={sectionHintClass}>
          Applies to the Assistant page only, not this worker&apos;s customer-facing replies.
        </p>
        <div className="mt-5">
          <SettingsToggleRow
            title="Let the Assistant take actions"
            description="Off by default. When on, the Assistant can send a reply, resolve a ticket, or publish a knowledge article, after describing the exact change and getting an explicit yes."
            checked={profile.assistantActionsEnabled}
            onChange={() => update("assistantActionsEnabled", !profile.assistantActionsEnabled)}
          />
        </div>
      </section>
    </>
  );
}
