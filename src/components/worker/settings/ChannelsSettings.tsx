"use client";

import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { dividerClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ChannelsConfig } from "@/lib/worker-api";

const CHANNEL_LABELS: { key: keyof ChannelsConfig; label: string; description: string; disabled?: boolean }[] = [
  { key: "chat", label: "Chat", description: "Manager test bench and the embeddable website widget." },
  { key: "email", label: "Email", description: "Requires an email provider connected under Integrations." },
  { key: "voice", label: "Voice", description: "Deferred — will be a native integration with AI Xccelerate's voice system, not a separate API key.", disabled: true },
];

export default function ChannelsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
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
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />
      <SettingsSection
        title="Where this worker can be reached"
        description="Attachments, live take-over and conversation history work the same way on every channel that is on."
        aixId="AIX-164.1"
      >
        <div className={dividerClass}>
          {CHANNEL_LABELS.map(({ key, label, description, disabled }) => (
            <SettingsToggleRow
              key={key}
              title={label}
              description={description}
              checked={profile.channelsConfig[key]}
              onChange={() => toggle(key)}
              disabled={disabled}
            />
          ))}
        </div>
      </SettingsSection>
    </>
  );
}
