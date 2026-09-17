"use client";

import { useRef, useState } from "react";
import AgentAvatar from "@/components/aix/AgentAvatar";
import Button from "@/components/ui/button/Button";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type { WorkerProfile } from "@/lib/worker-api";

/**
 * Settings > Identity > Avatar.
 *
 * A file is not a form field, so this card cannot sit behind the page's Save
 * button the way the text inputs do — picking an image and pressing Upload
 * writes it immediately, and the card says so. `applyServerUpdate` folds the
 * server's row back into the shared profile without discarding anything the
 * manager has typed elsewhere on the page and not yet saved.
 *
 * The external-URL field stays available underneath: uploads land on the API
 * service's own disk, which does not survive a redeploy on an ephemeral
 * filesystem, so pointing at a CDN is still the durable option.
 */
const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 1024 * 1024;

type Props = {
  profile: WorkerProfile;
  onUpdated: (updated: WorkerProfile, fields: (keyof WorkerProfile)[]) => void;
};

export default function AvatarUploadCard({ profile, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function choose(next: File | null) {
    setError("");
    setNotice("");

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (!next) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    // Checked here as well as on the server so the obvious mistakes cost a
    // message rather than a round trip.
    if (!ACCEPT.split(",").includes(next.type)) {
      setFile(null);
      setPreviewUrl(null);
      setError("PNG, JPEG, or WebP only.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setPreviewUrl(null);
      setError(`Images must be 1 MB or smaller. This one is ${formatBytes(next.size)}.`);
      return;
    }

    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await apiFetch<WorkerProfile>("/worker/avatar", {
        method: "POST",
        body: form,
      });
      onUpdated(updated, ["avatarUrl"]);
      reset();
      setNotice("Avatar updated.");
    } catch (err) {
      setError(
        err instanceof WorkerApiError
          ? (err.errors?.file ?? err.message)
          : "Could not upload. Check that the API is running.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiFetch<WorkerProfile>("/worker/avatar", { method: "DELETE" });
      onUpdated(updated, ["avatarUrl"]);
      reset();
      setNotice("Avatar removed. The worker shows its initials again.");
    } catch {
      setError("Could not remove. Check that the API is running.");
    } finally {
      setBusy(false);
    }
  }

  const displayName = profile.displayName || profile.name || "This worker";

  return (
    <>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Avatar</h2>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
        A face makes {displayName} read like a teammate. Shown on its profile, in chat, and
        anywhere the worker appears.
      </p>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {previewUrl ? (
            // Deliberately a plain <img>: this is a blob: URL for a file that
            // has not been uploaded yet, which next/image cannot optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Avatar preview"
              className="size-20 rounded-full object-cover ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
            />
          ) : (
            <AgentAvatar
              initials={profile.avatarInitials}
              size="lg"
              accentColor={profile.accentColor}
              avatarUrl={profile.avatarUrl}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Image file
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full cursor-pointer rounded-lg border border-gray-300 text-sm text-gray-500 transition file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:border-r file:border-gray-300 file:bg-gray-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:file:border-gray-700 dark:file:bg-white/5 dark:file:text-gray-300 dark:hover:file:bg-white/10"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            PNG, JPEG, or WebP. Square works best. Max 1 MB.
          </p>

          {file && (
            <p className="mt-2 truncate text-xs text-gray-600 dark:text-gray-300">
              {file.name}{" "}
              <span className="text-gray-400 dark:text-gray-500">({formatBytes(file.size)})</span>
            </p>
          )}

          {error && (
            <p className="mt-2 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="mt-2 text-xs font-medium leading-5 text-success-600 dark:text-success-400">
              {notice}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={!file || busy} onClick={() => void upload()}>
              {busy && file ? "Uploading…" : "Upload avatar"}
            </Button>
            {file && (
              <Button size="sm" variant="outline" disabled={busy} onClick={reset}>
                Cancel
              </Button>
            )}
            {profile.avatarUrl && !file && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void removeAvatar()}>
                Remove
              </Button>
            )}
          </div>

          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Uploading saves straight away. The Save button above does not apply to it.
          </p>
        </div>
      </div>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
