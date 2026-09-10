"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function ManagerSettingsPage() {
  const { profile, update, save, saving, notice, noticeError } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Human manager"
        description="This worker routes sensitive or unsupported conversations to this person."
        onSave={() => save(["managerName", "managerEmail"])}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
      />
      <section className={cardClass}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Manager name
            <input value={profile.managerName} onChange={(e) => update("managerName", e.target.value)} className={`${fieldClass} mt-2`} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Manager email
            <input
              type="email"
              value={profile.managerEmail ?? ""}
              onChange={(e) => update("managerEmail", e.target.value || null)}
              className={`${fieldClass} mt-2`}
            />
          </label>
        </div>
      </section>
    </>
  );
}
