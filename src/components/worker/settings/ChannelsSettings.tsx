"use client";

import WorkerChat from "@/components/worker/WorkerChat";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import WidgetInstallCard from "@/components/worker/settings/WidgetInstallCard";
import { dividerClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ChannelsConfig } from "@/lib/worker-api";

/**
 * Channels owns the chat channel end to end: the switch, a bench to try it on,
 * and the snippet that puts it on a website.
 *
 * The playground here is deliberately a second door onto the same surface as
 * the top-level Chat screen, not a replacement for it. Chat is where a manager
 * works. This is where they check that an edit to the role, guardrails or
 * knowledge actually landed — without leaving the screen they made it on.
 */
const CHANNEL_LABELS: { key: keyof ChannelsConfig; label: string; description: string; disabled?: boolean }[] = [
  { key: "chat", label: "Chat", description: "The playground below, and the embeddable website widget." },
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

      {/*
        Not `interactive` — the card holds a live conversation, so a border
        that shifts whenever the pointer crosses it is noise, not affordance.
      */}
      <SettingsSection
        title="Playground"
        description="Talk to this worker the way a visitor would. It answers from the role, guardrails, knowledge and tools it is configured with right now, and nothing said here reaches a customer."
        aixId="AIX-164.2"
        interactive={false}
      >
        <div className="h-[30rem] sm:h-[34rem]">
          <WorkerChat />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Website widget"
        description="Put this same conversation on your own site. The snippet is bound to this organization."
        aixId="AIX-164.3"
        interactive={false}
      >
        <WidgetInstallCard />
      </SettingsSection>
    </>
  );
}
