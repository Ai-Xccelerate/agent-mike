import { randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Avatar storage for Settings > Identity.
 *
 * Public URLs stay relative (`/api/v1/uploads/avatars/<file>`) and are served
 * by the GET proxy route — the frontend rewrite already covers that path, so
 * no CDN or public bucket is required.
 *
 * When Railway bucket credentials are present (`BUCKET`, `ACCESS_KEY_ID`,
 * `SECRET_ACCESS_KEY`, `ENDPOINT`), objects live under `avatars/` in the
 * bucket and survive redeploys. Without those variables the helpers fall
 * back to local disk under `public/uploads/avatars` (or `UPLOADS_DIR`) so
 * `next dev` keeps working.
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

const OBJECT_PREFIX = "avatars/";

type ObjectStorage = {
  client: S3Client;
  bucket: string;
};

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

/**
 * Railway bucket credentials (or AWS SDK equivalents). Null means "use disk".
 *
 * All of bucket + keys + endpoint must be set; a half-configured service must
 * not attempt S3 calls that would fail on every avatar upload.
 */
export function objectStorageConfig(): ObjectStorage | null {
  const bucket = envValue("BUCKET", "AWS_S3_BUCKET");
  const accessKeyId = envValue("ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = envValue("SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const endpoint = envValue("ENDPOINT", "AWS_ENDPOINT_URL");
  const region = envValue("REGION", "AWS_REGION") || "auto";

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;

  return {
    bucket,
    client: new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function usesObjectStorage(): boolean {
  return objectStorageConfig() !== null;
}

/** Object key inside the bucket for a stored avatar filename. */
export function avatarObjectKey(filename: string): string {
  return `${OBJECT_PREFIX}${filename}`;
}

/** Where uploads are written on disk. Absolute, so it does not depend on CWD. */
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
 * separators and absolute paths must never reach `path.join` or an S3 key.
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

function newAvatarFilename(orgId: string, mimeType: string): string {
  const ext = AVATAR_TYPES[mimeType];
  if (!ext) throw new Error(`Unsupported image type: ${mimeType}`);

  const orgSlug = orgId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${orgSlug || "org"}-${randomBytes(8).toString("hex")}.${ext}`;
}

/**
 * Writes an avatar and returns its filename.
 *
 * The name carries random bytes rather than the original filename: two orgs
 * uploading `avatar.png` must not collide, and a changed avatar must not be
 * masked by a cached response at the same URL.
 */
export async function writeAvatar(orgId: string, bytes: Buffer, mimeType: string): Promise<string> {
  const filename = newAvatarFilename(orgId, mimeType);
  const storage = objectStorageConfig();

  if (storage) {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: avatarObjectKey(filename),
        Body: bytes,
        ContentType: mimeType,
        ContentLength: bytes.byteLength,
      }),
    );
    return filename;
  }

  await mkdir(avatarsDir(), { recursive: true });
  await writeFile(path.join(avatarsDir(), filename), bytes);
  return filename;
}

/** Reads a stored avatar. Missing objects/files return null (caller maps to 404). */
export async function readAvatar(filename: string): Promise<Buffer | null> {
  const safe = safeFilename(filename);
  if (!safe) return null;

  const storage = objectStorageConfig();
  if (storage) {
    try {
      const response = await storage.client.send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: avatarObjectKey(safe),
        }),
      );
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isMissingObjectError(error)) return null;
      throw error;
    }
  }

  try {
    return await readFile(path.join(avatarsDir(), safe));
  } catch {
    return null;
  }
}

/** Deletes a stored avatar. A file that is already gone is not an error. */
export async function deleteAvatar(filename: string): Promise<void> {
  const safe = safeFilename(filename);
  if (!safe) return;

  const storage = objectStorageConfig();
  if (storage) {
    try {
      await storage.client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: avatarObjectKey(safe),
        }),
      );
    } catch (error) {
      if (isMissingObjectError(error)) return;
      throw error;
    }
    return;
  }

  await unlink(path.join(avatarsDir(), safe)).catch(() => undefined);
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code =
    "Code" in error
      ? String((error as { Code?: unknown }).Code)
      : "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
  const status =
    "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  return (
    name === "NoSuchKey" ||
    name === "NotFound" ||
    code === "NoSuchKey" ||
    code === "NotFound" ||
    status === 404
  );
}
