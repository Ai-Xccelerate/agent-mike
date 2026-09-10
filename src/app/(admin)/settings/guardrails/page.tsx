"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function GuardrailsSettingsPage() {
  const { profile, update, save, saving, notice, noticeError } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Guardrails"
        description="Deterministic checks that run before the model — low-confidence answers never auto-send."
        onSave={() => save(["confidenceThreshold", "escalationTerms", "allowedDomains", "requireUserVerification"])}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
      />

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Confidence &amp; escalation</h2>
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
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Domain &amp; user restriction</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          A standard, foundation-level feature — not something built per worker. Leave empty to allow any sender.
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
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Require user verification</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Confirm the requester is a valid customer before responding. Configuration, not a one-off codebase — the
              actual lookup is a tool call the agent makes.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={profile.requireUserVerification}
            onClick={() => update("requireUserVerification", !profile.requireUserVerification)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              profile.requireUserVerification ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${
                profile.requireUserVerification ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </section>
    </>
  );
}
