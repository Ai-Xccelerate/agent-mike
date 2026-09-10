"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass, textareaClass } from "@/components/worker/settings/ui";
import { EnvelopeIcon } from "@/icons";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function IdentitySettingsPage() {
  const { profile, update, save, saving, notice, noticeError } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Identity"
        description="How this worker introduces itself across every channel — white-labelable per deployment (R16)."
        onSave={() => save(["name", "displayName", "avatarInitials", "email", "tone"])}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
      />
      <section className={cardClass}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <AgentAvatar initials={profile.avatarInitials} size="lg" showStatus />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Basics</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Name, avatar, and tone — the layer that differs per role (R5).</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Internal name
            <input value={profile.name} onChange={(e) => update("name", e.target.value)} className={`${fieldClass} mt-2`} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Customer-facing name
            <input value={profile.displayName} onChange={(e) => update("displayName", e.target.value)} className={`${fieldClass} mt-2`} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Avatar initials
            <input
              value={profile.avatarInitials}
              maxLength={4}
              onChange={(e) => update("avatarInitials", e.target.value.toUpperCase())}
              className={`${fieldClass} mt-2`}
            />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Support email address
            <div className="relative mt-2">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={profile.email ?? ""}
                onChange={(e) => update("email", e.target.value || null)}
                className={`${fieldClass} pl-10`}
              />
            </div>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
            Tone
            <textarea rows={3} value={profile.tone} onChange={(e) => update("tone", e.target.value)} className={`${textareaClass} mt-2`} />
          </label>
        </div>
      </section>
    </>
  );
}
