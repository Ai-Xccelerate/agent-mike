import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Local file storage for uploaded avatars.
 *
 * Files land on the API service's own disk under `public/uploads/avatars` (or
 * `UPLOADS_DIR`), and are served back through a route handler rather than
 * Next's static `public/` serving. That is deliberate: `public/` is copied at
 * build time, so a file written at runtime is served in `next dev` and then
 * silently 404s in a production build. A route handler reads from disk on every
 * request and behaves the same in both.
 *
 * Serving through `/api/v1/...` also means the stored URL travels the rewrite
 * the frontend already has, so no extra proxy rule is needed.
 *
 * This is deployment-local storage: on a platform with an ephemeral filesystem
 * (Railway included) an uploaded avatar does not survive a redeploy. That is
 * the known trade for not having object storage yet — the URL field remains
 * for anyone who would rather point at a CDN.
 */

/** Accepted image types, mapped to the extension each is stored under. */
export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const AVATAR_MAX_BYTES = 1024 * 1024; // 1 MB

/** Human-readable list for error messages and UI hints. */
export const AVATAR_TYPE_LABEL = "PNG, JPEG, or WebP";

/** Where uploads are written. Absolute, so it does not depend on CWD. */
export function uploadsDir(): string {
  const configured = (process.env.UPLOADS_DIR || "").trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "public", "uploads");
}

export function avatarsDir(): string {
  return path.join(uploadsDir(), "avatars");
}

/** The public path an avatar file is served at. */
export function avatarUrlFor(filename: string): string {
  return `/api/v1/uploads/avatars/${filename}`;
}

/**
 * The stored filename for an avatar URL this server issued, or null.
 *
 * Used to delete the file an avatar is replacing. Anything else — an external
 * https URL, a hand-typed path — returns null and is left alone: we only ever
 * remove files we wrote.
 */
export function avatarFilenameFrom(url: string | null): string | null {
  if (!url) return null;
  const match = /^\/api\/v1\/uploads\/avatars\/([A-Za-z0-9._-]+)$/.exec(url.trim());
  if (!match) return null;
  return safeFilename(match[1]);
}

/**
 * Rejects anything that is not a plain filename.
 *
 * The serving route takes its filename from the URL, so traversal (`..`),
 * separators and absolute paths must never reach `path.join`.
 */
export function safeFilename(name: string): string | null {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (path.basename(name) !== name) return null;
  return name;
}

export function contentTypeFor(filename: string): string | null {
  const ext = path.extname(filename).slice(1).toLowerCase();
  for (const [type, mapped] of Object.entries(AVATAR_TYPES)) {
    if (mapped === ext) return type;
  }
  return null;
}

/**
 * Writes an avatar and returns its filename.
 *
 * The name carries random bytes rather than the original filename: two orgs
 * uploading `avatar.png` must not collide, and a changed avatar must not be
 * masked by a cached response at the same URL.
 */
export async function writeAvatar(orgId: string, bytes: Buffer, mimeType: string): Promise<string> {
  const ext = AVATAR_TYPES[mimeType];
  if (!ext) throw new Error(`Unsupported image type: ${mimeType}`);

  const orgSlug = orgId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  const filename = `${orgSlug || "org"}-${randomBytes(8).toString("hex")}.${ext}`;

  await mkdir(avatarsDir(), { recursive: true });
  await writeFile(path.join(avatarsDir(), filename), bytes);
  return filename;
}

/** Deletes a stored avatar. A file that is already gone is not an error. */
export async function deleteAvatar(filename: string): Promise<void> {
  const safe = safeFilename(filename);
  if (!safe) return;
  await unlink(path.join(avatarsDir(), safe)).catch(() => undefined);
}
