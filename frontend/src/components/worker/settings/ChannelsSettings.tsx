"use client";

import Link from "next/link";
import { useState } from "react";
import Button, { buttonClassName } from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { dividerClass } from "@/components/worker/settings/ui";
import { ChatIcon, CopyIcon } from "@/icons";
import { apiFetch, WidgetSite } from "@/lib/worker-api";
import { useWorkerProfile } from "@/lib/use-worker-profile";

/**
 * Channels owns the chat channel end to end: the switch, and the two things
 * that only matter once it's on — a way to try it and a way to embed it.
 *
 * Those two used to be full sections (an embedded Playground panel, a
 * separate widget card) shown regardless of whether Chat was even on. They
 * are now two compact actions that reveal themselves directly under the Chat
 * row the moment it's switched on, and disappear with it — nothing to look
 * at when the channel is off.
 */

function widgetEmbedSnippet(siteToken: string) {
  const origin = window.location.origin;
  const src = `${origin}/widget?site=${encodeURIComponent(siteToken)}`;
  return `<!-- AI Worker website widget (bound to your organization) -->
<iframe
  src="${src}"
  title="Chat"
  style="position:fixed;right:0;bottom:0;width:420px;height:720px;max-width:100vw;max-height:100vh;border:0;z-index:2147483646;background:transparent;color-scheme:light"
></iframe>`;
}

function ChatChannelActions() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyEmbed() {
    try {
      const site = await apiFetch<WidgetSite>("/widget-site");
      if (!site.siteToken) throw new Error("No site token");
      await navigator.clipboard.writeText(widgetEmbedSnippet(site.siteToken));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  return (
    <div className="pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/playground" target="_blank" rel="noopener noreferrer" className={buttonClassName({ size: "sm", variant: "outline" })}>
          <ChatIcon className="size-4" />
          Open playground
        </Link>
        <Button size="sm" variant="outline" startIcon={<CopyIcon className="size-4" />} onClick={() => void copyEmbed()}>
          {copyState === "copied" ? "Copied" : "Copy widget snippet"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        Playground opens in a new tab against your last saved configuration. Unsaved edits on other settings
        pages won&apos;t appear there until you save them.
      </p>
      {copyState === "copied" && (
        <p className="mt-2 text-xs font-medium text-success-600 dark:text-success-400">Copied to clipboard.</p>
      )}
      {copyState === "error" && (
        <p className="mt-2 text-xs font-medium text-error-600 dark:text-error-400">Could not copy. Try again.</p>
      )}
    </div>
  );
}

export default function ChannelsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  function toggle(key: "chat" | "email" | "voice") {
    update("channelsConfig", { ...profile!.channelsConfig, [key]: !profile!.channelsConfig[key] });
  }

  return (
    <>
      <SettingsPageHeader
        title="Channels"
        description="Turn channels on or off for this worker."
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
          <div>
            <SettingsToggleRow
              title="Chat"
              description="Playground and the embeddable website widget."
              checked={profile.channelsConfig.chat}
              onChange={() => toggle("chat")}
            />
            {profile.channelsConfig.chat && <ChatChannelActions />}
          </div>
          <SettingsToggleRow
            title="Email"
            description="Requires an email provider connected under Integrations."
            checked={profile.channelsConfig.email}
            onChange={() => toggle("email")}
          />
          <SettingsToggleRow
            title="Voice"
            description="Coming soon, built directly into AI Xccelerate's voice system."
            checked={profile.channelsConfig.voice}
            onChange={() => toggle("voice")}
            disabled
          />
        </div>
      </SettingsSection>
    </>
  );
}
