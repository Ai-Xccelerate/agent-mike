"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { cardClass, fieldClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";

export default function ManagerSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Human manager"
        description="This worker routes sensitive or unsupported conversations to this person."
        onSave={() => save(["managerName", "managerEmail", "emailManagerOnHandoff", "firstReplyTargetHours"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
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
        <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300 sm:w-1/2 sm:pr-2">
          First reply target (hours)
          <input
            type="number"
            min={1}
            max={720}
            inputMode="numeric"
            value={profile.firstReplyTargetHours ?? ""}
            placeholder="No target"
            onChange={(e) => update("firstReplyTargetHours", e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)}
            className={`${fieldClass} mt-2`}
          />
          <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
            How soon your team aims to reply once a conversation is handed over. Shown on the Overview.
          </span>
        </label>
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
          <SettingsToggleRow
            title="Email me when a conversation is handed over"
            description={
              profile.managerEmail
                ? `Sent to ${profile.managerEmail} from this worker's connected mailbox, once per conversation. Customers never see it.`
                : "Add a manager email above to get these."
            }
            checked={profile.emailManagerOnHandoff}
            disabled={saving}
            onChange={() => update("emailManagerOnHandoff", !profile.emailManagerOnHandoff)}
          />
        </div>
      </section>
    </>
  );
}
