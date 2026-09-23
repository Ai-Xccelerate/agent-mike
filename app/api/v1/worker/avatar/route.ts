import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  AVATAR_TYPE_LABEL,
  avatarFilenameFrom,
  avatarUrlFor,
  deleteAvatar,
  writeAvatar,
} from "@/lib/uploads";

// Writes to disk and the DB per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Settings > Identity > Avatar.
 *
 * POST   uploads an image and points the profile at it.
 * DELETE clears the avatar and removes the file.
 *
 * The `avatarUrl` field stays as it was: this route only ever writes a URL
 * into it, so pointing the worker at an external CDN image by hand still
 * works, and switching between the two is just another PATCH.
 */

// Cast rather than `instanceof File` — Node's global File and the fetch-spec
// File that FormData returns don't structurally match in this tsconfig (no
// "dom" lib). Matches the approach in knowledge/ingest-files.
type UploadedFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const form = await req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") {
    return NextResponse.json(
      { error: "No file provided", errors: { file: "Choose an image to upload." } },
      { status: 400 },
    );
  }

  const file = entry as unknown as UploadedFile;

  if (!AVATAR_TYPES[file.type]) {
    return NextResponse.json(
      {
        error: "Unsupported image type",
        errors: { file: `${AVATAR_TYPE_LABEL} only — this file is ${file.type || "an unknown type"}.` },
      },
      { status: 422 },
    );
  }

  // Checked against the declared size first so an oversized upload is rejected
  // before it is read into memory, then against the bytes actually received —
  // the header is client-supplied and the buffer is what hits the disk.
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "Image too large",
        errors: { file: `Images must be 1 MB or smaller — this one is ${formatBytes(file.size)}.` },
      },
      { status: 422 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "Image too large",
        errors: { file: `Images must be 1 MB or smaller — this one is ${formatBytes(bytes.byteLength)}.` },
      },
      { status: 422 },
    );
  }

  const filename = await writeAvatar(tenant.orgId, bytes, file.type);

  const [updated] = await db
    .update(workerProfiles)
    .set({ avatarUrl: avatarUrlFor(filename), updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  // Only after the profile points at the new file, so a failed update never
  // leaves the worker pointing at something that has been deleted.
  const previous = avatarFilenameFrom(profile.avatarUrl);
  if (previous && previous !== filename) await deleteAvatar(previous);

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const [updated] = await db
    .update(workerProfiles)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  const previous = avatarFilenameFrom(profile.avatarUrl);
  if (previous) await deleteAvatar(previous);

  return NextResponse.json(updated);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
