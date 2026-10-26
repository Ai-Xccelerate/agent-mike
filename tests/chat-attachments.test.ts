/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messageAttachments, messages, organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { runChatRequest } from "@/lib/chat-turn";
import {
  ATTACHMENT_LIMITS,
  attachmentMarker,
  attachmentsByMessage,
  deleteExpiredAttachments,
  inspectFile,
  linkUploads,
  readAttachment,
  safeFilename,
  saveUpload,
  usableUploads,
} from "@/lib/attachments";
import { POST as upload } from "@/app/api/v1/chat/attachments/route";
import { GET as download } from "@/app/api/v1/attachments/[id]/route";
import { GET as conversationDetail } from "@/app/api/v1/conversations/[id]/route";

const runAgentMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => null),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 7)]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml xl/workbook.xml")]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml word/document.xml")]);

describe("which files are accepted", () => {
  it("accepts each allowed type when its own bytes match", () => {
    for (const [name, bytes] of [["shot.png", PNG], ["shot.JPG", JPEG], ["a.jpeg", JPEG], ["a.webp", WEBP], ["report.pdf", PDF], ["notes.txt", Buffer.from("hello")], ["app.log", Buffer.from("error 1\nerror 2")], ["list.csv", Buffer.from("a,b\n1,2")], ["sheet.xlsx", XLSX], ["doc.docx", DOCX]] as const) {
      expect(inspectFile(name, bytes as Buffer).ok, name).toBe(true);
    }
  });

  it("refuses by what the file really is, not by what it says it is", () => {
    expect(inspectFile("virus.png", Buffer.from("MZ\x90\x00not an image")).ok).toBe(false);
    expect(inspectFile("page.pdf", Buffer.from("<html>not a pdf</html>")).ok).toBe(false);
    expect(inspectFile("fake.xlsx", Buffer.from("just text")).ok).toBe(false);
    expect(inspectFile("sheet.xlsx", DOCX).ok).toBe(false);
    expect(inspectFile("notes.txt", Buffer.from([0x41, 0x00, 0x42])).ok).toBe(false);
    expect(inspectFile("notes.txt", Buffer.from([0xff, 0xfe, 0xfd])).ok).toBe(false);
  });

  it("refuses types that can carry code, archives, macros, empty and oversized files", () => {
    for (const name of ["x.exe", "x.zip", "x.html", "x.svg", "x.js", "x.sh", "x.docm", "x.xlsm", "noextension"]) {
      expect(inspectFile(name, Buffer.from("hello")).ok, name).toBe(false);
    }
    expect(inspectFile("macro.xlsx", Buffer.concat([XLSX, Buffer.from(" xl/vbaProject.bin")])).ok).toBe(false);
    expect(inspectFile("empty.txt", Buffer.alloc(0)).ok).toBe(false);
    const big = inspectFile("big.txt", Buffer.alloc(ATTACHMENT_LIMITS.maxFileBytes + 1, 65));
    expect(big).toMatchObject({ ok: false });
    expect((big as { reason: string }).reason).toContain("10 MB");
  });

  it("keeps only a plain file name", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\shot.png")).toBe("shot.png");
    expect(safeFilename('we"ird<name>.png')).toBe("weirdname.png");
    expect(safeFilename("")).toBe("file");
  });

  it("writes the lines the team sees", () => {
    expect(attachmentMarker([{ filename: "shot.png", sizeBytes: 2048 }, { filename: "big.pdf", sizeBytes: 3 * 1024 * 1024 }])).toBe("[Attached: shot.png (2 KB)]\n[Attached: big.pdf (3.0 MB)]");
  });
});

const previousAdapter = getIdentityAdapter();
let orgId: string;
let otherOrg: string;

function adapterFor(org: string, role: "owner" | "member" = "owner"): IdentityAdapter {
  return {
    resolveManagerRequest: async (req) => ({ orgId: req.headers.get("x-test-org") ?? org, userId: "m", role, source: "test" }),
    resolveWidgetRequest: async (req) => (req.headers.get("x-worker-site-token") === "good" ? { orgId: org, userId: "widget", role: "member", source: "widget" } : null),
  };
}
async function setting(on: boolean) {
  await getOrCreateProfile(orgId);
  await db.update(workerProfiles).set({ chatAttachments: on }).where(eq(workerProfiles.organizationId, orgId));
}
function uploadRequest(name: string, bytes: Buffer, headers: Record<string, string> = { "x-worker-site-token": "good" }) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name));
  return new NextRequest("http://localhost/api/v1/chat/attachments", { method: "POST", headers, body: form });
}
const json = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(async () => {
  orgId = `att-${crypto.randomUUID()}`;
  otherOrg = `att-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await ensureOrganization(otherOrg, otherOrg);
  await getOrCreateProfile(orgId);
  setIdentityAdapter(adapterFor(orgId));
  runAgentMock.mockReset();
  runAgentMock.mockResolvedValue({ answer: "Thanks, I've passed that on.", confidence: 0.9, escalate: false, citations: [] });
});
afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
});

describe("storing, sending and expiring a file", () => {
  it("holds an upload unsent for an hour, links it to a message, then keeps it 30 days", async () => {
    const saved = await saveUpload({ organizationId: orgId, filename: "shot.png", bytes: PNG });
    expect(saved.ok).toBe(true);
    const id = (saved as { file: { id: string } }).file.id;
    const [pending] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id));
    expect(pending.messageId).toBeNull();
    expect(pending.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(ATTACHMENT_LIMITS.pendingTtlMs);

    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const [message] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "customer", senderName: "V", body: "hi" }).returning();
    await linkUploads({ organizationId: orgId, conversationId: conversation.id, messageId: message.id, ids: [id] });
    const [linked] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id));
    expect(linked.messageId).toBe(message.id);
    expect(linked.expiresAt.getTime() - Date.now()).toBeGreaterThan(ATTACHMENT_LIMITS.keepMs - 60_000);
    expect((await attachmentsByMessage(orgId, conversation.id)).get(message.id)).toEqual([{ id, filename: "shot.png", contentType: "image/png", sizeBytes: PNG.length }]);
  });

  it("only offers files that are this organization's, unsent and unexpired", async () => {
    const mine = (await saveUpload({ organizationId: orgId, filename: "a.png", bytes: PNG })) as any;
    const theirs = (await saveUpload({ organizationId: otherOrg, filename: "b.png", bytes: PNG })) as any;
    const old = (await saveUpload({ organizationId: orgId, filename: "c.png", bytes: PNG })) as any;
    await db.update(messageAttachments).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(messageAttachments.id, old.file.id));
    const got = await usableUploads({ organizationId: orgId, conversationId: null, ids: [mine.file.id, theirs.file.id, old.file.id, "not-a-uuid"] });
    expect(got.map((f) => f.id)).toEqual([mine.file.id]);
  });

  it("holds a conversation to five files and 25 MB", async () => {
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(((await saveUpload({ organizationId: orgId, filename: `f${i}.txt`, bytes: Buffer.from(`file ${i}`) })) as any).file.id);
    const first = await usableUploads({ organizationId: orgId, conversationId: conversation.id, ids });
    expect(first).toHaveLength(ATTACHMENT_LIMITS.maxFilesPerConversation);

    const bigOrg = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const sizes = [9, 9, 9].map((mb) => Buffer.alloc(mb * 1024 * 1024, 65));
    const bigIds: string[] = [];
    for (const [i, bytes] of sizes.entries()) bigIds.push(((await saveUpload({ organizationId: orgId, filename: `big${i}.txt`, bytes })) as any).file.id);
    expect(await usableUploads({ organizationId: orgId, conversationId: bigOrg.id, ids: bigIds })).toHaveLength(2);
  });

  it("deletes expired files, and a file is read back only by its own organization", async () => {
    const saved = (await saveUpload({ organizationId: orgId, filename: "a.png", bytes: PNG })) as any;
    expect((await readAttachment(orgId, saved.file.id))?.filename).toBe("a.png");
    expect(await readAttachment(otherOrg, saved.file.id)).toBeNull();
    await db.update(messageAttachments).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(messageAttachments.id, saved.file.id));
    expect(await readAttachment(orgId, saved.file.id)).toBeNull();
    await deleteExpiredAttachments();
    expect(await db.select().from(messageAttachments).where(eq(messageAttachments.id, saved.file.id))).toEqual([]);
  });

  it("stops a flood of unsent uploads", async () => {
    await db.insert(messageAttachments).values(
      Array.from({ length: ATTACHMENT_LIMITS.pendingPerOrgPerHour }, () => ({ organizationId: orgId, filename: "a.png", contentType: "image/png", sizeBytes: 1, sha256: "x", data: Buffer.from("x"), expiresAt: new Date(Date.now() + 60_000) })),
    );
    const refused = await saveUpload({ organizationId: orgId, filename: "a.png", bytes: PNG });
    expect(refused).toMatchObject({ ok: false, status: 429 });
  });
});

describe("POST /api/v1/chat/attachments", () => {
  it("is off until a manager switches it on, and needs a real site token", async () => {
    expect((await upload(uploadRequest("a.png", PNG))).status).toBe(403);
    await setting(true);
    expect((await upload(uploadRequest("a.png", PNG, { "x-worker-site-token": "bad" }))).status).toBe(401);
    const ok = await upload(uploadRequest("a.png", PNG));
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ filename: "a.png", content_type: "image/png", size: PNG.length });
  });

  it("explains a refusal in plain words", async () => {
    await setting(true);
    const wrongType = await upload(uploadRequest("run.exe", Buffer.from("MZ")));
    expect(wrongType.status).toBe(422);
    expect((await json(wrongType)).error).toContain("can't be attached");
    const fake = await upload(uploadRequest("fake.png", Buffer.from("not really a png")));
    expect(fake.status).toBe(422);
    expect((await json(fake)).error).toContain("real PNG");
  });

  it("refuses an oversized body before reading it", async () => {
    await setting(true);
    const req = uploadRequest("a.png", PNG, { "x-worker-site-token": "good", "content-length": String(ATTACHMENT_LIMITS.maxFileBytes + 1024 * 1024) });
    expect((await upload(req)).status).toBe(413);
  });
});

describe("sending a message with files", () => {
  const send = async (message: string, attachmentIds: string[], conversationId?: string) => {
    const outcome = await runChatRequest(new NextRequest("http://localhost/api/v1/chat", { method: "POST", headers: { "x-worker-site-token": "good" } }), {
      message,
      attachment_ids: attachmentIds,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    });
    return outcome;
  };

  it("adds what was attached to the customer's message and links the files", async () => {
    await setting(true);
    const saved = (await saveUpload({ organizationId: orgId, filename: "shot.png", bytes: PNG })) as any;
    const outcome = await send("The preview is blank, screenshot attached", [saved.file.id]);
    expect(outcome.status).toBe(200);
    const conversationId = outcome.json.conversation_id as string;
    const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    const customer = rows.find((row) => row.senderType === "customer");
    expect(customer?.body).toBe(`The preview is blank, screenshot attached\n\n[Attached: shot.png (1 KB)]`);
    const [file] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, saved.file.id));
    expect(file).toMatchObject({ messageId: customer?.id, conversationId });
    // The worker is told what the customer sent.
    expect(String(runAgentMock.mock.calls[0][2])).toContain("[Attached: shot.png");
  });

  it("ignores attachments when the setting is off, or the file is another organization's", async () => {
    const mine = (await saveUpload({ organizationId: orgId, filename: "a.png", bytes: PNG })) as any;
    const off = await send("hello", [mine.file.id]);
    const [offMessage] = await db.select().from(messages).where(eq(messages.conversationId, off.json.conversation_id as string));
    expect(offMessage.body).toBe("hello");

    await setting(true);
    const theirs = (await saveUpload({ organizationId: otherOrg, filename: "b.png", bytes: PNG })) as any;
    const on = await send("hello again", [theirs.file.id, "not-an-id"]);
    const rows = await db.select().from(messages).where(eq(messages.conversationId, on.json.conversation_id as string));
    expect(rows.find((row) => row.senderType === "customer")?.body).toBe("hello again");
  });

  it("shows the files on the conversation for a manager, and lets only that organization's manager download them", async () => {
    await setting(true);
    const saved = (await saveUpload({ organizationId: orgId, filename: "shot.png", bytes: PNG })) as any;
    const outcome = await send("see attached", [saved.file.id]);
    const conversationId = outcome.json.conversation_id as string;

    const detail = await json(await conversationDetail(new NextRequest(`http://localhost/api/v1/conversations/${conversationId}`), { params: { id: conversationId } }));
    const customer = (detail.messages as any[]).find((m) => m.senderType === "customer");
    expect(customer.customerFiles).toEqual([{ id: saved.file.id, filename: "shot.png", contentType: "image/png", sizeBytes: PNG.length }]);

    const res = await download(new NextRequest(`http://localhost/api/v1/attachments/${saved.file.id}`), { params: { id: saved.file.id } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);

    const foreign = await download(new NextRequest(`http://localhost/api/v1/attachments/${saved.file.id}`, { headers: { "x-test-org": otherOrg } }), { params: { id: saved.file.id } });
    expect(foreign.status).toBe(404);
    expect((await download(new NextRequest("http://localhost/api/v1/attachments/nonsense"), { params: { id: "nonsense" } })).status).toBe(404);
  });

  it("shows an image in place only on request, and never anything else", async () => {
    await setting(true);
    const png = (await saveUpload({ organizationId: orgId, filename: "shot.png", bytes: PNG })) as any;
    const pdf = (await saveUpload({ organizationId: orgId, filename: "doc.pdf", bytes: PDF })) as any;
    const view = async (id: string, query: string) => (await download(new NextRequest(`http://localhost/api/v1/attachments/${id}${query}`), { params: { id } })).headers.get("content-disposition") ?? "";
    expect(await view(png.file.id, "?inline=1")).toContain("inline");
    expect(await view(png.file.id, "")).toContain("attachment");
    expect(await view(pdf.file.id, "?inline=1")).toContain("attachment");
  });
});
