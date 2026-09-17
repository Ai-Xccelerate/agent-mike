"use client";

import { Suspense } from "react";
import ArtifactsIntegrationCard from "@/components/worker/settings/ArtifactsIntegrationCard";
import AgentDbIntegrationCard from "@/components/worker/settings/AgentDbIntegrationCard";
import AgentWikiIntegrationCard from "@/components/worker/settings/AgentWikiIntegrationCard";
import MailboxCard from "@/components/worker/settings/MailboxCard";
import ParchmentIntegrationCard from "@/components/worker/settings/ParchmentIntegrationCard";
import ScribeIntegrationCard from "@/components/worker/settings/ScribeIntegrationCard";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { dividerClass } from "@/components/worker/settings/ui";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { ToolsConfig } from "@/lib/worker-api";

/**
 * Two kinds of tool live on this screen, and they save differently.
 *
 * General capabilities are plain flags on the worker profile, so they follow
 * the page's dirty/save/discard header like every other settings form.
 *
 * Internal tools are separately connected systems with their own credentials
 * and endpoints. They cannot be staged behind this page's Save without
 * pretending a connection is a form field, so each card saves itself when its
 * controls are used. The section says so rather than leaving that ambiguous.
 */
const TOOL_LABELS: { key: keyof ToolsConfig; label: string; description: string }[] = [
  { key: "browser_use", label: "Browser use", description: "Navigate and read live web pages." },
  { key: "internet_search", label: "Internet", description: "General web search." },
];

export default function ToolsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  function toggle(key: keyof ToolsConfig) {
    update("toolsConfig", { ...profile!.toolsConfig, [key]: !profile!.toolsConfig[key] });
  }

  return (
    <>
      <SettingsPageHeader
        title="Tools"
        description="Turn general-purpose capabilities on or off for this worker."
        onSave={() => save(["toolsConfig"])}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <SettingsSection
        title="General"
        description="Broad capabilities this worker can use. Saved with the button above."
        aixId="AIX-163.1"
      >
        <div className={dividerClass}>
          {TOOL_LABELS.map(({ key, label, description }) => (
            <SettingsToggleRow
              key={key}
              title={label}
              description={description}
              checked={profile.toolsConfig[key]}
              onChange={() => toggle(key)}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Internal tools"
        description="AI Xccelerate's own built-in tools. These save automatically when you switch them, not with the button above."
        aixId="AIX-163.2"
        interactive={false}
      >
        <div className="space-y-4">
          <AgentDbIntegrationCard />
          <AgentWikiIntegrationCard />
          <ParchmentIntegrationCard />
          <ScribeIntegrationCard />
          <ArtifactsIntegrationCard />
        </div>
      </SettingsSection>

      <SettingsSection
        title="External tools"
        description="Third-party tools this worker connects to directly. These save automatically when you use them, not with the button above."
        aixId="AIX-163.3"
        interactive={false}
      >
        <div className="space-y-4">
          <Suspense fallback={null}>
            <MailboxCard />
          </Suspense>
        </div>
      </SettingsSection>
    </>
  );
}
