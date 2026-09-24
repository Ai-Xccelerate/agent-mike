import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import {
  ATTACHMENT_MAX_FILES,
  AttachmentRejected,
  createAttachment,
  extractAttachmentText,
} from "@/lib/assistant-attachments";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

type UploadedFile = {
  name: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/**
 * "Add files" in the admin Assistant: extracts each file's text and stores
 * it unbound (no conversation yet). Nothing is added to the knowledge base
 * or skills here - the file is only attached to the next chat message,
 * where the manager's chosen intent decides what the Assistant proposes.
 * Each file succeeds or fails on its own so one bad file doesn't sink the
 * rest of the batch.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const form = await req.formData().catch(() => null);
  // Same cast as knowledge/ingest-files: FormData's File doesn't match
  // Node's global File type under this tsconfig.
  const files = (form?.getAll("files") ?? []).filter((f) => typeof f !== "string") as unknown as UploadedFile[];
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > ATTACHMENT_MAX_FILES) {
    return NextResponse.json(
      { error: `Attach up to ${ATTACHMENT_MAX_FILES} files at a time.` },
      { status: 422 },
    );
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        const { text, truncated } = await extractAttachmentText(file.name, bytes);
        const saved = await createAttachment({
          organizationId: tenant.orgId,
          filename: file.name,
          mimeType: file.type || null,
          sizeBytes: bytes.byteLength,
          extractedText: text,
          truncated,
        });
        return {
          ok: true as const,
          id: saved.id,
          filename: saved.filename,
          sizeBytes: saved.sizeBytes,
          charCount: text.length,
          truncated,
        };
      } catch (error) {
        const message =
          error instanceof AttachmentRejected ? error.message : "Something went wrong reading this file.";
        return { ok: false as const, filename: file.name, error: message };
      }
    }),
  );

  return NextResponse.json(results);
}
