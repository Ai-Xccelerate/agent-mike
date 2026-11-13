"use client";

import Link from "next/link";
import { useState } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Button, { buttonClassName } from "@/components/ui/button/Button";
import MailboxStatusLine from "@/components/worker/settings/MailboxStatusLine";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/worker/settings/SettingsToggle";
import { counterClass, dividerClass, fieldClass, hintClass, labelClass, textareaClass, selectFieldClass } from "@/components/worker/settings/ui";
import { ChatIcon, CopyIcon } from "@/icons";
import {
  defaultWelcomeMessage,
  QUICK_ACTION_MAX_LENGTH,
  QUICK_ACTIONS_MAX,
  quickActionsFor,
  WELCOME_MESSAGE_MAX_LENGTH,
} from "@/lib/widget-defaults";
import {
  brandScale,
  CONTRAST_FLOOR,
  contrastWithWhite,
  resolveWidgetAppearance,
  WIDGET_LABEL_MAX_LENGTH,
  type WidgetAppearance,
} from "@/lib/widget-appearance";
import { apiFetch, WidgetSite, WorkerProfile } from "@/lib/worker-api";
import { useWorkerProfile } from "@/lib/use-worker-profile";


/** Everything on this page that the header's Save writes. */
const CHANNEL_FIELDS: (keyof WorkerProfile)[] = ["channelsConfig", "welcomeMessage", "quickActions", "chatAttachments", "accentColor", "widgetAppearance"];

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

const AIX_ORANGE = "#F47920";

const THEME_OPTIONS: { value: WidgetAppearance["theme"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Match the visitor's device" },
];
const CORNER_OPTIONS: { value: WidgetAppearance["corners"]; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "soft", label: "Extra rounded" },
];
const ICON_OPTIONS: { value: WidgetAppearance["launcherIcon"]; label: string }[] = [
  { value: "chat", label: "Chat bubble" },
  { value: "message", label: "Message" },
  { value: "headset", label: "Headset" },
];

/**
 * How the website chat looks: the brand colour (the worker's accent colour), light or dark, corners, the launcher's
 * icon, and the panel's title and subtitle. The chat reads these when the page loads, so a change shows on the
 * visitor's next visit with no new embed code.
 */
function ChatAppearanceSettings({
  profile,
  update,
  fieldErrors,
}: {
  profile: WorkerProfile;
  update: Update;
  fieldErrors: Record<string, string>;
}) {
  const appearance = resolveWidgetAppearance(profile.widgetAppearance);
  const set = (patch: Partial<WidgetAppearance>) => update("widgetAppearance", { ...appearance, ...patch });
  // The hex box is typed into, so it keeps what is typed until it is a whole colour.
  const [hexDraft, setHexDraft] = useState(profile.accentColor);
  const shown = /^#[0-9a-fA-F]{6}$/.test(hexDraft) ? hexDraft : profile.accentColor;
  const contrast = contrastWithWhite(profile.accentColor);
  const dark = brandScale(profile.accentColor)?.["--color-brand-600"] ?? profile.accentColor;
  const labelError = (key: string) => fieldErrors[`widgetAppearance.${key}`];

  function setColor(value: string) {
    setHexDraft(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) update("accentColor", value);
  }

  return (
    <fieldset className="mt-6 space-y-4 border-t border-gray-100 pt-5 dark:border-gray-800">
      <legend className={labelClass}>Chat appearance</legend>
      <p className={hintClass}>
        Match the chat to your site. Visitors see a change the next time they load the page. The chat inside your own page
        and the floating widget both use these.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={labelClass}>Brand colour</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="color"
              value={shown}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Brand colour"
              className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
            />
            <input
              type="text"
              value={hexDraft}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Brand colour as a hex code"
              spellCheck={false}
              maxLength={7}
              className={`${fieldClass} font-mono`}
            />
          </div>
          <FieldError message={fieldErrors.accentColor} />
          {contrast !== null && contrast < CONTRAST_FLOOR && (
            <p className="mt-1.5 text-xs text-warning-700 dark:text-warning-400">
              White text on this colour has a contrast of {contrast}:1, below {CONTRAST_FLOOR}:1. Buttons may be hard to read.
            </p>
          )}
        </div>
        <label className="block">
          <span className={labelClass}>Light or dark</span>
          <select className={`${selectFieldClass} mt-1.5`} value={appearance.theme} onChange={(event) => set({ theme: event.target.value as WidgetAppearance["theme"] })}>
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Corners</span>
          <select className={`${selectFieldClass} mt-1.5`} value={appearance.corners} onChange={(event) => set({ corners: event.target.value as WidgetAppearance["corners"] })}>
            {CORNER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Launcher icon</span>
          <select className={`${selectFieldClass} mt-1.5`} value={appearance.launcherIcon} onChange={(event) => set({ launcherIcon: event.target.value as WidgetAppearance["launcherIcon"] })}>
            {ICON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Panel title</span>
          <input
            className={`${fieldClass} mt-1.5`}
            value={appearance.panelTitle ?? ""}
            maxLength={WIDGET_LABEL_MAX_LENGTH}
            placeholder={profile.displayName}
            onChange={(event) => set({ panelTitle: event.target.value || null })}
          />
          <FieldError message={labelError("panelTitle")} />
        </label>
        <label className="block">
          <span className={labelClass}>Panel subtitle</span>
          <input
            className={`${fieldClass} mt-1.5`}
            value={appearance.panelSubtitle ?? ""}
            maxLength={WIDGET_LABEL_MAX_LENGTH}
            placeholder="AI assistant"
            onChange={(event) => set({ panelSubtitle: event.target.value || null })}
          />
          <FieldError message={labelError("panelSubtitle")} />
        </label>
      </div>

      <div aria-hidden className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <span className="text-xs text-gray-500 dark:text-gray-400">Preview</span>
        <span className="rounded-2xl px-3 py-2 text-sm text-white" style={{ backgroundColor: profile.accentColor }}>A visitor&apos;s message</span>
        <span className="rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: profile.accentColor, color: dark }}>Quick reply</span>
        <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: profile.accentColor }}>
          <svg className="size-4" viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setHexDraft(AIX_ORANGE);
          update("accentColor", AIX_ORANGE);
          update("widgetAppearance", null);
        }}
      >
        Use the AI Xccelerate defaults
      </Button>
    </fieldset>
  );
}

/** Email channel panel: mailbox status only. The address and signature are edited under Settings > Identity. */
function EmailChannelSettings() {
  return (
    <div className="mb-6 space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <MailboxStatusLine />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        The support address and email signature are set under{" "}
        <Link href="/settings/identity" className="underline hover:text-brand-600 dark:hover:text-brand-400">
          Settings &gt; Identity
        </Link>
        .
      </p>
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
          {/* The toggle row drops its bottom padding as the last child of a wrapper; restore it so the panels never touch the divider. */}
          <div className="pb-4">
            <SettingsToggleRow
              title="Chat"
              description="Playground and the embeddable website widget."
              checked={profile.channelsConfig.chat}
              onChange={() => toggle("chat")}
            />
            {profile.channelsConfig.chat && <ChatChannelActions />}
            {profile.channelsConfig.chat && <ChatChannelSettings profile={profile} update={update} fieldErrors={fieldErrors} />}
            {profile.channelsConfig.chat && <ChatAppearanceSettings profile={profile} update={update} fieldErrors={fieldErrors} />}
          </div>
          {/* The row drops its top padding as the first child of a wrapper (and its bottom padding as the last), so both are restored. */}
          <div className={profile.channelsConfig.email ? "pt-4" : "py-4"}>
            <SettingsToggleRow
              title="Email"
              description="Requires an email provider connected under Integrations."
              checked={profile.channelsConfig.email}
              onChange={() => toggle("email")}
            />
            {profile.channelsConfig.email && <EmailChannelSettings />}
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
