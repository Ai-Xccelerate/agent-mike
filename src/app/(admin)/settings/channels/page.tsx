"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ChannelsConfig } from "@/lib/worker-api";

const CHANNEL_LABELS: { key: keyof ChannelsConfig; label: string; description: string; disabled?: boolean }[] = [
  { key: "chat", label: "Chat", description: "Manager test bench and the embeddable website widget." },
  { key: "email", label: "Email", description: "Requires an email provider connected under Integrations." },
  { key: "voice", label: "Voice", description: "Deferred — will be a native integration with AI Xccelerate's voice system, not a separate API key.", disabled: true },
];

export default function ChannelsSettingsPage() {
  const { profile, update, save, saving, notice, noticeError } = useWorkerProfile();
  if (!profile) return null;

  function toggle(key: keyof ChannelsConfig) {
    update("channelsConfig", { ...profile!.channelsConfig, [key]: !profile!.channelsConfig[key] });
  }

  return (
    <>
      <SettingsPageHeader
        title="Channels"
        description="Attachments, live take-over, and conversation history are standardized across every channel below."
        onSave={() => save(["channelsConfig"])}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
      />
      <section className={cardClass}>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {CHANNEL_LABELS.map(({ key, label, description, disabled }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
              </div>
              <button
                role="switch"
                aria-checked={profile.channelsConfig[key]}
                disabled={disabled}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  profile.channelsConfig[key] ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${
                    profile.channelsConfig[key] ? "translate-x-5" : ""
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
