"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import Button from "@/components/ui/button/Button";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type { WorkerProfile } from "@/lib/worker-api";

/**
 * Settings > Identity > Photo.
 *
 * A file is not a form field, so this does not sit behind the page's Save
 * button: picking or dropping an image uploads it straight away, and Remove
 * clears it straight away. `onUpdated` folds the server's row back into the
 * shared profile without discarding anything typed elsewhere on the page.
 */
const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  profile: WorkerProfile;
  onUpdated: (updated: WorkerProfile, fields: (keyof WorkerProfile)[]) => void;
};

export default function AvatarUploadCard({ profile, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File | null | undefined) {
    if (!file) return;
    setError("");

    // Checked here as well as on the server so the obvious mistakes cost a
    // message rather than a round trip.
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Images must be 5 MB or smaller. This one is ${formatBytes(file.size)}.`);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await apiFetch<WorkerProfile>("/worker/avatar", { method: "POST", body: form });
      onUpdated(updated, ["avatarUrl"]);
    } catch (err) {
      setError(
        err instanceof WorkerApiError
          ? (err.errors?.file ?? err.message)
          : "Could not upload. Check that the API is running.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setError("");
    try {
      const updated = await apiFetch<WorkerProfile>("/worker/avatar", { method: "DELETE" });
      onUpdated(updated, ["avatarUrl"]);
    } catch {
      setError("Could not remove. Check that the API is running.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) void upload(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex size-22 shrink-0 items-center justify-center overflow-hidden rounded-full text-3xl font-semibold text-white ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-gray-900 ${
          dragging ? "ring-brand-500" : "ring-transparent"
        }`}
        style={{ backgroundColor: profile.accentColor }}
      >
        {profile.avatarUrl ? (
          // Plain <img>: the stored path is served by the API proxy, which next/image cannot optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          profile.avatarInitials.slice(0, 2).toUpperCase()
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium">
            Saving
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
            className="sr-only"
            id="avatar-file"
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            Upload photo
          </Button>
          {profile.avatarUrl && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void removeAvatar()}>
              Remove
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          PNG, JPEG or WebP. Up to 5 MB. Drag a file onto the photo to upload. Photos save as soon as they upload.
        </p>
        {error && (
          <p className="mt-1.5 text-xs font-medium leading-5 text-error-600 dark:text-error-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
