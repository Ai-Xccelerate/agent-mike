"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, sectionTitleClass, textareaClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function RoleSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Role"
        description="Define this worker's job in plain language — becomes part of its system prompt."
        onSave={() => save(["role", "jobDescription", "autoReply"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Role and scope</h2>
        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Role description
          <textarea rows={4} value={profile.role} onChange={(e) => update("role", e.target.value)} className={`${textareaClass} mt-2`} />
        </label>
        <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Job description (optional, longer detail)
          <textarea
            rows={5}
            value={profile.jobDescription ?? ""}
            onChange={(e) => update("jobDescription", e.target.value || null)}
            className={`${textareaClass} mt-2`}
          />
        </label>
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Automatic replies</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Send approved, high-confidence answers without review.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={profile.autoReply}
            onClick={() => update("autoReply", !profile.autoReply)}
            className={`relative h-6 w-11 rounded-full transition-colors ${profile.autoReply ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
                profile.autoReply ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </section>
    </>
  );
}
