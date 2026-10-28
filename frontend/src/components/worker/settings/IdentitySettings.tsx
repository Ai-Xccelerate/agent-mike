"use client";

import { useMemo } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import AvatarUploadCard from "@/components/worker/settings/AvatarUploadCard";
import MailboxStatusLine from "@/components/worker/settings/MailboxStatusLine";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, counterClass, fieldClass, textareaClass } from "@/components/worker/settings/ui";
import { EnvelopeIcon } from "@/icons";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { WorkerProfile } from "@/lib/worker-api";

const TITLE_MAX_LENGTH = 80;
const BIO_MAX_LENGTH = 500;
const TONE_MAX_LENGTH = 500;
const SIGNATURE_MAX_LENGTH = 300;

// Name is written to both `name` and `displayName`: the app reads displayName
// everywhere, and the backend still stores `name`. avatarInitials follows the
// name so a worker without a photo never shows stale letters.
const IDENTITY_FIELDS: (keyof WorkerProfile)[] = [
  "name",
  "displayName",
  "avatarInitials",
  "avatarUrl",
  "title",
  "bio",
  "tone",
  "email",
  "emailSignature",
  "timezone",
  "locale",
];

const COMMON_LOCALES = [
  "en-GB",
  "en-US",
  "en-AU",
  "en-CA",
  "en-IN",
  "fr-FR",
  "de-DE",
  "es-ES",
  "es-MX",
  "it-IT",
  "nl-NL",
  "pt-BR",
];

const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function localeLabel(code: string): string {
  try {
    const label = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return label && label !== code ? `${label} (${code})` : code;
  } catch {
    return code;
  }
}

function timezoneList(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      "timeZone",
    );
    if (supported?.length) return ["UTC", ...supported.filter((zone) => zone !== "UTC")];
  } catch {
    // Older browsers: use the short list.
  }
  return FALLBACK_TIMEZONES;
}

/** Keeps the saved value selectable even when it is not in the standard list. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1.5 block text-xs font-normal text-error-600 dark:text-error-400">{message}</span>;
}

const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const hintClass = "mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400";

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </>
  );
}

export default function IdentitySettings() {
  const { profile, update, save, discard, applyServerUpdate, dirty, saving, notice, noticeError, fieldErrors, lastEditedAt } =
    useWorkerProfile();
  const timezones = useMemo(() => timezoneList(), []);
  if (!profile) return null;

  const locales = withCurrent(COMMON_LOCALES, profile.locale);
  const zones = withCurrent(timezones, profile.timezone);

  function setName(value: string) {
    update("displayName", value);
    update("name", value);
    update("avatarInitials", initialsFor(value));
  }

  return (
    <>
      <SettingsPageHeader
        title="Identity"
        description="How this worker introduces itself on every channel."
        onSave={() => save(IDENTITY_FIELDS)}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass} data-aix-id="AIX-160.1">
        <SectionHeading
          title="Profile"
          description="The name and photo people see in chat, email and the website widget."
        />

        <div className="mt-6">
          <AvatarUploadCard profile={profile} onUpdated={applyServerUpdate} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Name
            <input value={profile.displayName} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-2`} />
            <span className={hintClass}>Shown to customers and your team.</span>
            <FieldError message={fieldErrors.displayName ?? fieldErrors.name} />
          </label>
          <label className={labelClass}>
            Title
            <input
              value={profile.title}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Customer support specialist"
              className={`${fieldClass} mt-2`}
            />
            <span className={hintClass}>Shown under the name in chat and the inbox.</span>
            <FieldError message={fieldErrors.title} />
          </label>
        </div>

        <label className={`${labelClass} mt-4`}>
          Short bio
          <AutoGrowTextarea
            minRows={3}
            maxRows={8}
            maxLength={BIO_MAX_LENGTH}
            value={profile.bio}
            onChange={(e) => update("bio", e.target.value)}
            className={`${textareaClass} mt-2`}
          />
          <span className={counterClass}>{profile.bio.length}/{BIO_MAX_LENGTH}</span>
          <FieldError message={fieldErrors.bio} />
        </label>
      </section>

      <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-160.2">
        <SectionHeading title="Voice" description="How it sounds when it talks to a customer." />
        <label className={`${labelClass} mt-5`}>
          Tone
          <AutoGrowTextarea
            minRows={2}
            maxRows={6}
            maxLength={TONE_MAX_LENGTH}
            value={profile.tone}
            onChange={(e) => update("tone", e.target.value)}
            className={`${textareaClass} mt-2`}
          />
          <span className={counterClass}>{profile.tone.length}/{TONE_MAX_LENGTH}</span>
          <FieldError message={fieldErrors.tone} />
        </label>
      </section>

      <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-160.3">
        <SectionHeading
          title="Contact and signature"
          description="Where customers reach it, and how an email reply ends."
        />

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Support email
            <div className="relative mt-2">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={profile.email ?? ""}
                onChange={(e) => update("email", e.target.value || null)}
                placeholder="support@yourcompany.com"
                className={`${fieldClass} pl-10`}
              />
            </div>
            <span className="mt-2 block">
              <MailboxStatusLine />
            </span>
            <FieldError message={fieldErrors.email} />
          </label>

          <label className={`${labelClass} text-gray-500 dark:text-gray-400`}>
            <span className="flex items-center gap-2">
              Phone number
              <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-px text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                Coming soon
              </span>
            </span>
            <input type="tel" disabled placeholder="+44 20 0000 0000" className={`${fieldClass} mt-2 bg-gray-100 dark:bg-white/5`} />
            <span className={hintClass}>Voice calls arrive with AIX voice.</span>
          </label>
        </div>

        <label className={`${labelClass} mt-4`}>
          Email signature
          <AutoGrowTextarea
            minRows={3}
            maxRows={8}
            maxLength={SIGNATURE_MAX_LENGTH}
            value={profile.emailSignature}
            onChange={(e) => update("emailSignature", e.target.value)}
            className={`${textareaClass} mt-2`}
          />
          <span className={hintClass}>Added to outgoing email only. Chat and the website widget do not use it.</span>
          <span className={counterClass}>{profile.emailSignature.length}/{SIGNATURE_MAX_LENGTH}</span>
          <FieldError message={fieldErrors.emailSignature} />
        </label>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Preview</div>
          <p className="mt-2.5 text-sm text-gray-700 dark:text-gray-300">
            Thanks for waiting. Your invoice has been re-sent to the address on file.
          </p>
          <p className="mt-3 whitespace-pre-line border-t border-gray-200 pt-3 text-[13px] leading-[19px] text-gray-600 dark:border-gray-800 dark:text-gray-400">
            {profile.emailSignature.trim() || "No signature set."}
          </p>
        </div>
      </section>

      <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-160.4">
        <SectionHeading title="Language and time" description="How it writes dates, times and numbers." />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Time zone
            <select value={profile.timezone} onChange={(e) => update("timezone", e.target.value)} className={`${fieldClass} mt-2`}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.timezone} />
          </label>
          <label className={labelClass}>
            Language and region
            <select value={profile.locale} onChange={(e) => update("locale", e.target.value)} className={`${fieldClass} mt-2`}>
              {locales.map((code) => (
                <option key={code} value={code}>
                  {localeLabel(code)}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.locale} />
          </label>
        </div>
      </section>
    </>
  );
}
