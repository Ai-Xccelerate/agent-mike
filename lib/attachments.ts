import { createHash } from "node:crypto";
import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messageAttachments } from "@/db/schema";

/**
 * Files a visitor attaches in the website chat, to be passed to the team. The worker never opens them.
 *
 * What is allowed, chosen from what a support request needs (screenshots, a PDF, a log, a CSV, a spreadsheet or a
 * document) and from what is safe to hold: a type is accepted only if its extension is on the list AND the file's own
 * first bytes match that type (the browser's label is whatever the sender says). Archives, executables, scripts, HTML
 * and SVG (which can carry script) and macro-enabled Office files are refused. Size and count are enforced here, on
 * the server.
 *
 * A file starts unlinked and expires within the hour; sending the message that carries it links it to that message
 * and keeps it 30 days. It is read back only by a signed-in manager.
 */

export const ATTACHMENT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerConversation: 5,
  maxBytesPerConversation: 25 * 1024 * 1024,
  pendingTtlMs: 60 * 60 * 1000,
  keepMs: 30 * 24 * 60 * 60 * 1000,
  /** Uploads not yet attached to a message, per organization per hour, so a public widget cannot fill the database. */
  pendingPerOrgPerHour: 300,
} as const;

export const ATTACHMENT_TYPES_LABEL = "images (PNG, JPG, WEBP), PDF, text, CSV, Excel or Word files";
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.csv,.xlsx,.docx";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Rule = { contentType: string; label: string; matches: (bytes: Buffer) => boolean };

const startsWith = (bytes: Buffer, signature: number[], at = 0) => signature.every((byte, index) => bytes[at + index] === byte);
const holds = (bytes: Buffer, text: string) => bytes.includes(Buffer.from(text, "latin1"));

/** A zip that is really an Office file of one kind, without macros. The archive is not unpacked. */
function officeFile(bytes: Buffer, folder: string): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && holds(bytes, "[Content_Types].xml") && holds(bytes, folder) && !holds(bytes, "vbaProject.bin");
}

function plainText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const RULES: Record<string, Rule> = {
  png: { contentType: "image/png", label: "PNG image", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { contentType: "image/jpeg", label: "JPG image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { contentType: "image/jpeg", label: "JPG image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { contentType: "image/webp", label: "WEBP image", matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  pdf: { contentType: "application/pdf", label: "PDF", matches: (b) => b.subarray(0, 1024).includes(Buffer.from("%PDF-")) },
  txt: { contentType: "text/plain; charset=utf-8", label: "text file", matches: plainText },
  log: { contentType: "text/plain; charset=utf-8", label: "log file", matches: plainText },
  csv: { contentType: "text/csv; charset=utf-8", label: "CSV file", matches: plainText },
  xlsx: { contentType: XLSX, label: "Excel file", matches: (b) => officeFile(b, "xl/") },
  docx: { contentType: DOCX, label: "Word file", matches: (b) => officeFile(b, "word/") },
};

/** Only the name, never a path, with nothing in it that could confuse a download or a log. */
export function safeFilename(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(-120);
}

export type Inspected = { ok: true; filename: string; contentType: string; label: string } | { ok: false; reason: string };

export function inspectFile(rawName: string, bytes: Buffer): Inspected {
  const filename = safeFilename(rawName);
  const ext = filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "";
  const rule = RULES[ext];
  if (!rule) return { ok: false, reason: `That type of file can't be attached. You can attach ${ATTACHMENT_TYPES_LABEL}.` };
  if (bytes.length === 0) return { ok: false, reason: "That file is empty." };
  if (bytes.length > ATTACHMENT_LIMITS.maxFileBytes) return { ok: false, reason: `That file is too big. The limit is ${ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)} MB.` };
  if (!rule.matches(bytes)) return { ok: false, reason: `That doesn't look like a real ${rule.label}, so it wasn't attached.` };
  return { ok: true, filename, contentType: rule.contentType, label: rule.label };
}

export type AttachmentInfo = { id: string; filename: string; contentType: string; sizeBytes: number };

export function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Lines added to the customer's message so the team, the ticket and the worker all see what was attached. */
export function attachmentMarker(files: Pick<AttachmentInfo, "filename" | "sizeBytes">[]): string {
  return files.map((file) => `[Attached: ${file.filename} (${describeSize(file.sizeBytes)})]`).join("\n");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadResult = { ok: true; file: AttachmentInfo } | { ok: false; status: number; reason: string };

/** Stores one checked file, not yet part of any message. */
export async function saveUpload(input: { organizationId: string; filename: string; bytes: Buffer }): Promise<UploadResult> {
  const checked = inspectFile(input.filename, input.bytes);
  if (!checked.ok) return { ok: false, status: 422, reason: checked.reason };

  const now = Date.now();
  const [pending] = await db
    .select({ n: count() })
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.organizationId, input.organizationId),
        isNull(messageAttachments.messageId),
        gte(messageAttachments.createdAt, new Date(now - 60 * 60 * 1000)),
      ),
    );
  if (Number(pending?.n ?? 0) >= ATTACHMENT_LIMITS.pendingPerOrgPerHour) {
    return { ok: false, status: 429, reason: "Too many files are being sent right now. Please try again in a little while." };
  }

  const [row] = await db
    .insert(messageAttachments)
    .values({
      organizationId: input.organizationId,
      filename: checked.filename,
      contentType: checked.contentType,
      sizeBytes: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      data: input.bytes,
      expiresAt: new Date(now + ATTACHMENT_LIMITS.pendingTtlMs),
    })
    .returning({ id: messageAttachments.id, filename: messageAttachments.filename, contentType: messageAttachments.contentType, sizeBytes: messageAttachments.sizeBytes });

  // Old files have served their purpose: unsent ones after an hour, sent ones after 30 days.
  void deleteExpiredAttachments().catch(() => undefined);
  return { ok: true, file: row };
}

/**
 * The files the customer chose, as far as they can be sent: each must belong to this organization, still be unsent and
 * unexpired, and fit the per-conversation limits together with what is already attached there. Returns what fits.
 */
export async function usableUploads(input: { organizationId: string; conversationId: string | null; ids: string[] }): Promise<AttachmentInfo[]> {
  // Anything that is not a real id is dropped here: the database would refuse it with an error.
  const ids = [...new Set(input.ids)].filter((id) => UUID.test(id)).slice(0, ATTACHMENT_LIMITS.maxFilesPerConversation * 2);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: messageAttachments.id, filename: messageAttachments.filename, contentType: messageAttachments.contentType, sizeBytes: messageAttachments.sizeBytes })
    .from(messageAttachments)
    .where(
      and(
        inArray(messageAttachments.id, ids),
        eq(messageAttachments.organizationId, input.organizationId),
        isNull(messageAttachments.messageId),
        sql`${messageAttachments.expiresAt} > now()`,
      ),
    );
  let files = 0;
  let bytes = 0;
  if (input.conversationId) {
    const [held] = await db
      .select({ n: count(), total: sql<number>`coalesce(sum(${messageAttachments.sizeBytes}), 0)` })
      .from(messageAttachments)
      .where(and(eq(messageAttachments.conversationId, input.conversationId), eq(messageAttachments.organizationId, input.organizationId)));
    files = Number(held?.n ?? 0);
    bytes = Number(held?.total ?? 0);
  }
  const usable: AttachmentInfo[] = [];
  for (const row of rows) {
    if (files + 1 > ATTACHMENT_LIMITS.maxFilesPerConversation || bytes + row.sizeBytes > ATTACHMENT_LIMITS.maxBytesPerConversation) continue;
    files += 1;
    bytes += row.sizeBytes;
    usable.push(row);
  }
  return usable;
}

/** Ties the files to the message that carries them, and keeps them 30 days from now. */
export async function linkUploads(input: { organizationId: string; conversationId: string; messageId: string; ids: string[] }): Promise<void> {
  const ids = input.ids.filter((id) => UUID.test(id));
  if (ids.length === 0) return;
  await db
    .update(messageAttachments)
    .set({ conversationId: input.conversationId, messageId: input.messageId, expiresAt: new Date(Date.now() + ATTACHMENT_LIMITS.keepMs) })
    .where(and(inArray(messageAttachments.id, ids), eq(messageAttachments.organizationId, input.organizationId), isNull(messageAttachments.messageId)));
}

/** What is attached to a conversation's messages, without the files themselves. */
export async function attachmentsByMessage(organizationId: string, conversationId: string): Promise<Map<string, AttachmentInfo[]>> {
  const rows = await db
    .select({ id: messageAttachments.id, messageId: messageAttachments.messageId, filename: messageAttachments.filename, contentType: messageAttachments.contentType, sizeBytes: messageAttachments.sizeBytes })
    .from(messageAttachments)
    .where(and(eq(messageAttachments.conversationId, conversationId), eq(messageAttachments.organizationId, organizationId), sql`${messageAttachments.expiresAt} > now()`));
  const byMessage = new Map<string, AttachmentInfo[]>();
  for (const row of rows) {
    if (!row.messageId) continue;
    const list = byMessage.get(row.messageId) ?? [];
    list.push({ id: row.id, filename: row.filename, contentType: row.contentType, sizeBytes: row.sizeBytes });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

/** One file with its bytes, for a signed-in manager of the same organization; null once expired or if it is not theirs. */
export async function readAttachment(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(messageAttachments)
    .where(and(eq(messageAttachments.id, id), eq(messageAttachments.organizationId, organizationId), sql`${messageAttachments.expiresAt} > now()`))
    .limit(1);
  return row ?? null;
}

export async function deleteExpiredAttachments(): Promise<void> {
  await db.delete(messageAttachments).where(lt(messageAttachments.expiresAt, new Date()));
}
