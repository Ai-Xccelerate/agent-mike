import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { resolveChatTenant } from "@/lib/chat-turn";
import { ATTACHMENT_LIMITS, saveUpload } from "@/lib/attachments";

// Reads and writes the database per request: never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * A visitor attaches one file in the website chat (multipart, field "file"). Public with the widget's site token, like
 * /api/v1/chat, and only for a worker whose manager has switched attachments on. The file is checked (type by its own
 * bytes, size) and held unsent; the chat message that carries its id links it.
 */
export async function POST(req: NextRequest) {
  const tenant = await resolveChatTenant(req);
  if (!tenant) return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const profile = await getOrCreateProfile(tenant.orgId);
  if (!profile.chatAttachments) return NextResponse.json({ error: "Attaching files is switched off for this chat." }, { status: 403 });

  // Refused before it is read, so an oversized body is never held in memory.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > ATTACHMENT_LIMITS.maxFileBytes + 256 * 1024) {
    return NextResponse.json({ error: `That file is too big. The limit is ${ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)} MB.` }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });

  const result = await saveUpload({ organizationId: tenant.orgId, filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ id: result.file.id, filename: result.file.filename, content_type: result.file.contentType, size: result.file.sizeBytes });
}
