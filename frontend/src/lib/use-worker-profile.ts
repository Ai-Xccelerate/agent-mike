"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, WorkerApiError, WorkerProfile } from "@/lib/worker-api";
import { useWorkerIdentity } from "@/context/WorkerIdentityContext";

const IDENTITY_UPDATED_EVENT = "aix:identity-updated";

function withIdentityDefaults(profile: WorkerProfile): WorkerProfile {
  return {
    ...profile,
    slug: profile.slug ?? "worker",
    status: profile.status ?? "active",
    avatarUrl: profile.avatarUrl ?? null,
    accentColor: profile.accentColor ?? "#F47920",
    bio: profile.bio ?? "",
    timezone: profile.timezone ?? "UTC",
    locale: profile.locale ?? "en-US",
    emailSignature: profile.emailSignature ?? "",
    enabledSkills: profile.enabledSkills ?? [],
  };
}

/**
 * Every Settings page shares one profile row and one save flow — this is
 * the client-side half of R15 ("every capability, plus the system prompt,
 * exposed and editable without a code deployment").
 */
export function useWorkerProfile() {
  // Seeded from WorkerIdentityContext's own fetch rather than running a
  // second, independent apiFetch("/worker") here. Two separate fetches of
  // the same endpoint could resolve at slightly different times, so the
  // sidebar (context) and this page could briefly show two different
  // placeholder/loaded states for the same profile. Seeded once, not kept
  // in sync on every later context change, so an in-progress unsaved edit
  // here is never clobbered by an unrelated update elsewhere (e.g. another
  // tab saving) — later updates still flow through applyServerUpdate/save().
  const identity = useWorkerIdentity();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [saved, setSaved] = useState<WorkerProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !identity) return;
    seededRef.current = true;
    const next = withIdentityDefaults(identity);
    setProfile(next);
    setSaved(next);
  }, [identity]);

  const dirty = Boolean(profile && saved && JSON.stringify(profile) !== JSON.stringify(saved));

  const lastEditedAt = useMemo(() => (saved?.updatedAt ? new Date(saved.updatedAt) : null), [saved]);

  function update<K extends keyof WorkerProfile>(key: K, value: WorkerProfile[K]) {
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  }

  /**
   * Adopts a profile the server changed outside this page's save flow — the
   * avatar upload, which writes immediately because a file is not a form field
   * that can sit staged behind Save.
   *
   * `saved` becomes the server's row wholesale, but only the named fields are
   * copied onto `profile`, so a name or tone the manager has typed and not yet
   * saved is not silently discarded by uploading a picture.
   */
  function applyServerUpdate(updated: WorkerProfile, fields: (keyof WorkerProfile)[]) {
    const next = withIdentityDefaults(updated);
    setSaved(next);
    setProfile((current) => {
      if (!current) return next;
      const patch = Object.fromEntries(fields.map((field) => [field, next[field]]));
      return { ...current, ...patch };
    });
    window.dispatchEvent(new CustomEvent(IDENTITY_UPDATED_EVENT, { detail: next }));
  }

  function discard() {
    if (!saved) return;
    setProfile(saved);
    setFieldErrors({});
    setNotice("");
    setNoticeError(false);
  }

  async function save(fields: (keyof WorkerProfile)[]) {
    if (!profile) return;
    setSaving(true);
    setNotice("");
    setNoticeError(false);
    setFieldErrors({});
    try {
      const payload = Object.fromEntries(fields.map((field) => [field, profile[field]]));
      const updated = withIdentityDefaults(
        await apiFetch<WorkerProfile>("/worker", {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      );
      setProfile(updated);
      setSaved(updated);
      setNotice("Saved.");
      window.dispatchEvent(new CustomEvent(IDENTITY_UPDATED_EVENT, { detail: updated }));
    } catch (error) {
      setNoticeError(true);
      if (error instanceof WorkerApiError && error.errors) {
        setFieldErrors(error.errors);
        setNotice(Object.values(error.errors)[0] ?? "Could not save.");
      } else {
        setNotice("Could not save. Check that the API is running.");
      }
    } finally {
      setSaving(false);
    }
  }

  return {
    profile,
    update,
    save,
    discard,
    applyServerUpdate,
    dirty,
    saving,
    notice,
    noticeError,
    fieldErrors,
    lastEditedAt,
  };
}

export { IDENTITY_UPDATED_EVENT };
