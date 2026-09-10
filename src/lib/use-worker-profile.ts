"use client";

import { useEffect, useState } from "react";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";

/**
 * Every Settings page shares one profile row and one save flow — this is
 * the client-side half of R15 ("every capability, plus the system prompt,
 * exposed and editable without a code deployment").
 */
export function useWorkerProfile() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  useEffect(() => {
    apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);
  }, []);

  function update<K extends keyof WorkerProfile>(key: K, value: WorkerProfile[K]) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(fields: (keyof WorkerProfile)[]) {
    if (!profile) return;
    setSaving(true);
    setNotice("");
    setNoticeError(false);
    try {
      const payload = Object.fromEntries(fields.map((field) => [field, profile[field]]));
      const updated = await apiFetch<WorkerProfile>("/worker", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setProfile(updated);
      setNotice("Saved.");
    } catch {
      setNoticeError(true);
      setNotice("Could not save — check that the API is running.");
    } finally {
      setSaving(false);
    }
  }

  return { profile, update, save, saving, notice, noticeError };
}
