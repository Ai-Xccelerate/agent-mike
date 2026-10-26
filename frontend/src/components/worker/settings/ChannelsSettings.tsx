"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Badge from "@/components/ui/badge/Badge";
import Button, { buttonClassName } from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { counterClass, dividerClass, fieldClass, textareaClass } from "@/components/worker/settings/ui";
import { ChatIcon, CopyIcon, EnvelopeIcon } from "@/icons";
import {
  defaultWelcomeMessage,
  QUICK_ACTION_MAX_LENGTH,
  QUICK_ACTIONS_MAX,
  quickActionsFor,
  WELCOME_MESSAGE_MAX_LENGTH,
} from "@/lib/widget-defaults";
import { apiFetch, MailboxStatus, WidgetSite, WorkerProfile } from "@/lib/worker-api";
import { useWorkerProfile } from "@/lib/use-worker-profile";

const SIGNATURE_MAX_LENGTH = 300;

/** Everything on this page that the header's Save writes. */
const CHANNEL_FIELDS: (keyof WorkerProfile)[] = ["channelsConfig", "email", "emailSignature", "welcomeMessage", "quickActions", "chatAttachments"];

type Update = <K extends keyof WorkerProfile>(key: K, value: WorkerProfile[K]) => void;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1.5 block text-xs font-normal text-error-600 dark:text-error-400">{message}</span>;
}

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

/** What the widget opens with: the greeting and the buttons under it. Shown under the Chat switch. */
function ChatChannelSettings({
  profile,
  update,
  fieldErrors,
}: {
  profile: WorkerProfile;
  update: Update;
  fieldErrors: Record<string, string>;
}) {
  // The API names the bad item ("quickActions.1"), so any of them counts.
  const quickActionsError = Object.entries(fieldErrors).find(([key]) => key === "quickActions" || key.startsWith("quickActions."))?.[1];
  const custom = profile.quickActions != null;
  const actions = quickActionsFor(profile);
  const welcome = profile.welcomeMessage ?? "";

  // Editing the built-in list turns it into the worker's own copy.
  const setActions = (next: string[]) => update("quickActions", next);

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02] space-y-5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Welcome message
        <AutoGrowTextarea
          minRows={2}
          maxRows={5}
          maxLength={WELCOME_MESSAGE_MAX_LENGTH}
          value={welcome}
          placeholder={defaultWelcomeMessage(profile.displayName)}
          onChange={(event) => update("welcomeMessage", event.target.value || null)}
          className={`${textareaClass} mt-2`}
        />
        <span className="mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
          The first thing a visitor sees in the website widget. Write {"{name}"} to use the worker&apos;s customer-facing
          name ({profile.displayName}). Leave empty for the default shown above.
        </span>
        <span className={counterClass}>
          {welcome.length}/{WELCOME_MESSAGE_MAX_LENGTH}
        </span>
        <FieldError message={fieldErrors.welcomeMessage} />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick actions</legend>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Buttons under the welcome message that send their text when tapped.{" "}
          {custom
            ? "These are this worker's own."
            : "These are the built-in ones for what this worker can do (ticket buttons only appear with a helpdesk connected); edit any to make them your own."}
        </p>
        <div className="mt-2 space-y-2">
          {actions.map((action, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={action}
                maxLength={QUICK_ACTION_MAX_LENGTH}
                aria-label={`Quick action ${index + 1}`}
                onChange={(event) => setActions(actions.map((item, i) => (i === index ? event.target.value : item)))}
                className={fieldClass}
              />
              <Button
                size="sm"
                variant="outline"
                aria-label={`Remove quick action ${index + 1}`}
                onClick={() => setActions(actions.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          {actions.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">No quick actions: the widget shows only the welcome message.</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={actions.length >= QUICK_ACTIONS_MAX}
            onClick={() => setActions([...actions, ""])}
          >
            Add quick action
          </Button>
          {custom && (
            <Button size="sm" variant="outline" onClick={() => update("quickActions", null)}>
              Use the built-in ones
            </Button>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">Up to {QUICK_ACTIONS_MAX}, {QUICK_ACTION_MAX_LENGTH} characters each.</span>
        </div>
        <FieldError message={quickActionsError} />
      </fieldset>
      <SettingsToggleRow
        title="Let visitors attach files"
        description={`Images, PDF, text, CSV, Excel and Word, up to 10 MB each and 5 per conversation. ${profile.displayName} never opens them: the file goes to the team with the conversation, and you download it from the Inbox. Kept for 30 days. The chat asks visitors not to attach anything that shows client or patient details.`}
        checked={profile.chatAttachments}
        onChange={() => update("chatAttachments", !profile.chatAttachments)}
      />
    </div>
  );
}

/** Whether the worker has a mailbox to send and receive from, with the way to connect one. */
function MailboxStatusLine() {
  const [status, setStatus] = useState<MailboxStatus | null | "failed">(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<MailboxStatus>("/mailbox")
      .then((next) => !cancelled && setStatus(next))
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  const badge =
    status === null
      ? null
      : status === "failed"
        ? { color: "light" as const, label: "Status unavailable" }
        : !status.available
          ? { color: "light" as const, label: "Not configured" }
          : !status.mailbox
            ? { color: "light" as const, label: "Not connected" }
            : status.mailbox.status === "invalid" || !status.connected
              ? { color: "warning" as const, label: "Reconnect needed" }
              : { color: "success" as const, label: "Connected" };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <span className="font-medium text-gray-700 dark:text-gray-300">Mailbox</span>
      {badge && (
        <Badge size="sm" color={badge.color}>
          {badge.label}
        </Badge>
      )}
      {status && status !== "failed" && status.mailbox?.email && <span className="text-xs text-gray-500">{status.mailbox.email}</span>}
      <Link href="/settings/tools" className="text-xs underline hover:text-brand-600 dark:hover:text-brand-400">
        {status && status !== "failed" && status.mailbox ? "Manage mailbox" : "Connect a mailbox"}
      </Link>
    </div>
  );
}

/** The address customers write to and how an email reply ends. Shown only while Email is on, like the Chat block. */
function EmailChannelSettings({
  profile,
  update,
  fieldErrors,
}: {
  profile: WorkerProfile;
  update: Update;
  fieldErrors: Record<string, string>;
}) {
  const signature = profile.emailSignature ?? "";
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02] space-y-4">
      <MailboxStatusLine />
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Support email address
        <div className="relative mt-2">
          <EnvelopeIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={profile.email ?? ""}
            onChange={(event) => update("email", event.target.value || null)}
            placeholder="support@yourcompany.com"
            className={`${fieldClass} pl-10`}
          />
        </div>
        <span className="mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
          The address customers write to. The worker also uses it to recognise its own mail, so it never replies to itself, and
          it is the login hint when you connect the mailbox.
        </span>
        <FieldError message={fieldErrors.email} />
      </label>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Email signature
        <AutoGrowTextarea
          minRows={3}
          maxRows={8}
          maxLength={SIGNATURE_MAX_LENGTH}
          value={signature}
          onChange={(event) => update("emailSignature", event.target.value)}
          className={`${textareaClass} mt-2`}
        />
        <span className="mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
          Added to outbound email only, never to chat or the website widget.
        </span>
        <span className={counterClass}>
          {signature.length}/{SIGNATURE_MAX_LENGTH}
        </span>
        <FieldError message={fieldErrors.emailSignature} />
      </label>
    </div>
  );
}

export default function ChannelsSettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, fieldErrors, lastEditedAt } = useWorkerProfile();
  if (!profile) return null;

  function toggle(key: "chat" | "email" | "voice") {
    update("channelsConfig", { ...profile!.channelsConfig, [key]: !profile!.channelsConfig[key] });
  }

  return (
    <>
      <SettingsPageHeader
        title="Channels"
        description="Turn channels on or off, and set what each one says and signs with."
        onSave={() => save(CHANNEL_FIELDS)}
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
          {/* The toggle row drops its bottom padding as the last child of a wrapper; restore it when no panel follows. */}
          <div className={profile.channelsConfig.chat ? "" : "pb-4"}>
            <SettingsToggleRow
              title="Chat"
              description="Playground and the embeddable website widget."
              checked={profile.channelsConfig.chat}
              onChange={() => toggle("chat")}
            />
            {profile.channelsConfig.chat && <ChatChannelActions />}
            {profile.channelsConfig.chat && <ChatChannelSettings profile={profile} update={update} fieldErrors={fieldErrors} />}
          </div>
          {/* The row drops its top padding as the first child of a wrapper (and its bottom padding as the last), so both are restored. */}
          <div className={profile.channelsConfig.email ? "pt-4" : "py-4"}>
            <SettingsToggleRow
              title="Email"
              description="Requires an email provider connected under Integrations."
              checked={profile.channelsConfig.email}
              onChange={() => toggle("email")}
            />
            {profile.channelsConfig.email && <EmailChannelSettings profile={profile} update={update} fieldErrors={fieldErrors} />}
          </div>
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
