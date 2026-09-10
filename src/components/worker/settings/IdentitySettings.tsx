"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass, fieldClass, textareaClass } from "@/components/worker/settings/ui";
import { EnvelopeIcon } from "@/icons";
import { useWorkerProfile } from "@/lib/use-worker-profile";
import type { WorkerProfile } from "@/lib/worker-api";

const IDENTITY_FIELDS: (keyof WorkerProfile)[] = [
  "name",
  "displayName",
  "avatarInitials",
  "slug",
  "status",
  "avatarUrl",
  "accentColor",
  "bio",
  "timezone",
  "locale",
  "email",
  "emailSignature",
  "tone",
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1.5 block text-xs font-normal text-error-600 dark:text-error-400">{message}</span>;
}

export default function IdentitySettings() {
  const { profile, update, save, discard, dirty, saving, notice, noticeError, fieldErrors, lastEditedAt } =
    useWorkerProfile();
  if (!profile) return null;

  return (
    <>
      <SettingsPageHeader
        title="Identity"
        description="How this worker introduces itself across every channel — white-labelable per deployment (R16)."
        onSave={() => save(IDENTITY_FIELDS)}
        onDiscard={discard}
        dirty={dirty}
        saving={saving}
        notice={notice}
        noticeError={noticeError}
        lastEditedAt={lastEditedAt}
      />

      <section className={cardClass} data-aix-id="AIX-160.1">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <AgentAvatar
            initials={profile.avatarInitials}
            size="lg"
            showStatus
            status={profile.status}
            accentColor={profile.accentColor}
            avatarUrl={profile.avatarUrl}
          />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Basics</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Name, avatar, and tone — the layer that differs per role (R5).
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Internal name
            <input value={profile.name} onChange={(e) => update("name", e.target.value)} className={`${fieldClass} mt-2`} />
            <FieldError message={fieldErrors.name} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Customer-facing name
            <input
              value={profile.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              className={`${fieldClass} mt-2`}
            />
            <FieldError message={fieldErrors.displayName} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Slug
            <input
              value={profile.slug}
              onChange={(e) => update("slug", e.target.value)}
              placeholder="support-worker"
              className={`${fieldClass} mt-2 font-mono`}
            />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">
              2–32 lowercase letters, numbers or hyphens.
            </span>
            <FieldError message={fieldErrors.slug} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
            <select
              value={profile.status}
              onChange={(e) => update("status", e.target.value as WorkerProfile["status"])}
              className={`${fieldClass} mt-2`}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
            <span className="mt-1.5 block text-xs font-normal text-gray-500">
              Stored now. Pausing does not yet stop chat replies.
            </span>
            <FieldError message={fieldErrors.status} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Avatar initials
            <input
              value={profile.avatarInitials}
              maxLength={4}
              onChange={(e) => update("avatarInitials", e.target.value.toUpperCase())}
              className={`${fieldClass} mt-2`}
            />
            <FieldError message={fieldErrors.avatarInitials} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Accent colour
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={profile.accentColor}
                onChange={(e) => update("accentColor", e.target.value.toUpperCase())}
                className="h-11 w-14 cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
              />
              <input
                value={profile.accentColor}
                onChange={(e) => update("accentColor", e.target.value.toUpperCase())}
                placeholder="#4F46E5"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <FieldError message={fieldErrors.accentColor} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
            Avatar URL
            <input
              value={profile.avatarUrl ?? ""}
              onChange={(e) => update("avatarUrl", e.target.value || null)}
              placeholder="https://…"
              className={`${fieldClass} mt-2`}
            />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">
              Optional image URL. File upload waits on object storage.
            </span>
            <FieldError message={fieldErrors.avatarUrl} />
          </label>
        </div>
      </section>

      <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-160.2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Voice</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">How it sounds when it talks to a customer.</p>
        <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Tone
          <textarea rows={3} value={profile.tone} onChange={(e) => update("tone", e.target.value)} className={`${textareaClass} mt-2`} />
          <FieldError message={fieldErrors.tone} />
        </label>
        <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Short bio
          <textarea
            rows={3}
            maxLength={500}
            value={profile.bio}
            onChange={(e) => update("bio", e.target.value)}
            className={`${textareaClass} mt-2`}
          />
          <span className="mt-1.5 block text-xs font-normal text-gray-500">{profile.bio.length}/500</span>
          <FieldError message={fieldErrors.bio} />
        </label>
      </section>

      <section className={`${cardClass} mt-5 md:mt-6`} data-aix-id="AIX-160.3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">How it signs off</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Regional formatting and email identity.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Timezone
            <input
              value={profile.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="Europe/London"
              className={`${fieldClass} mt-2`}
            />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">IANA timezone such as Europe/London.</span>
            <FieldError message={fieldErrors.timezone} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Locale
            <input
              value={profile.locale}
              onChange={(e) => update("locale", e.target.value)}
              placeholder="en-GB"
              className={`${fieldClass} mt-2`}
            />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">BCP-47 locale such as en-GB.</span>
            <FieldError message={fieldErrors.locale} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Support email address
            <div className="relative mt-2">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={profile.email ?? ""}
                onChange={(e) => update("email", e.target.value || null)}
                className={`${fieldClass} pl-10`}
              />
            </div>
            <FieldError message={fieldErrors.email} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
            Email signature
            <textarea
              rows={3}
              maxLength={300}
              value={profile.emailSignature}
              onChange={(e) => update("emailSignature", e.target.value)}
              className={`${textareaClass} mt-2`}
            />
            <span className="mt-1.5 block text-xs font-normal text-gray-500">{profile.emailSignature.length}/300</span>
            <FieldError message={fieldErrors.emailSignature} />
          </label>
        </div>
      </section>
    </>
  );
}
