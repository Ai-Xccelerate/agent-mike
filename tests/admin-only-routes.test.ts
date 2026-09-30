import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

vi.mock("@/lib/outbound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/outbound")>();
  return { ...actual, sendAsWorker: vi.fn() };
});

vi.mock("@/lib/assistant-attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant-attachments")>();
  return { ...actual, createAttachment: vi.fn() };
});

import { db } from "@/lib/db";
import { conversations, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter, type TenantContext } from "@/lib/identity";
import { sendAsWorker } from "@/lib/outbound";
import { createAttachment } from "@/lib/assistant-attachments";
import { PATCH as patchConversation, DELETE as deleteConversation } from "@/app/api/v1/conversations/[id]/route";
import { POST as sendMail } from "@/app/api/v1/mailbox/send/route";
import { POST as uploadAttachments } from "@/app/api/v1/assistant/attachments/route";

const previousAdapter = getIdentityAdapter();
let orgId: string;

// Stands in for the Clerk adapter: the route only sees the verified tenant.
function as(role: TenantContext["role"]): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: `user-${role}`, role, source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seedConversation() {
  const [row] = await db
    .insert(conversations)
    .values({ organizationId: orgId, ticketNumber: 1001, channel: "widget", subject: "Original" })
    .returning();
  return row;
}

async function loadConversation(id: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return row;
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Admin-only routes test");
  vi.mocked(sendAsWorker).mockReset();
  vi.mocked(createAttachment).mockReset();
});

afterEach(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

afterAll(() => setIdentityAdapter(previousAdapter));

describe("conversation PATCH/DELETE", () => {
  it("refuses a member and leaves the conversation untouched", async () => {
    const conversation = await seedConversation();
    setIdentityAdapter(as("member"));
    const url = `http://localhost/api/v1/conversations/${conversation.id}`;

    const patched = await patchConversation(jsonRequest(url, "PATCH", { status: "closed", subject: "Changed" }), {
      params: { id: conversation.id },
    });
    expect(patched.status).toBe(403);

    const deleted = await deleteConversation(jsonRequest(url, "DELETE"), { params: { id: conversation.id } });
    expect(deleted.status).toBe(403);

    const after = await loadConversation(conversation.id);
    expect(after.status).toBe(conversation.status);
    expect(after.subject).toBe("Original");
  });

  it("still lets an admin or owner change and delete", async () => {
    const conversation = await seedConversation();
    const url = `http://localhost/api/v1/conversations/${conversation.id}`;

    setIdentityAdapter(as("admin"));
    const patched = await patchConversation(jsonRequest(url, "PATCH", { status: "resolved" }), {
      params: { id: conversation.id },
    });
    expect(patched.status).toBe(200);
    expect((await loadConversation(conversation.id)).status).toBe("resolved");

    setIdentityAdapter(as("owner"));
    const deleted = await deleteConversation(jsonRequest(url, "DELETE"), { params: { id: conversation.id } });
    expect(deleted.status).toBe(200);
    expect(await loadConversation(conversation.id)).toBeUndefined();
  });
});

describe("mailbox/send", () => {
  const payload = { to: [{ email: "customer@example.com" }], subject: "Hello", body: "Hi" };

  it("refuses a member before anything is sent", async () => {
    setIdentityAdapter(as("member"));
    const res = await sendMail(jsonRequest("http://localhost/api/v1/mailbox/send", "POST", payload));
    expect(res.status).toBe(403);
    expect(sendAsWorker).not.toHaveBeenCalled();
  });

  it("gets past the role check for an admin (the email channel is then the gate)", async () => {
    setIdentityAdapter(as("admin"));
    const res = await sendMail(jsonRequest("http://localhost/api/v1/mailbox/send", "POST", payload));
    expect(res.status).not.toBe(403);
  });
});

describe("assistant/attachments", () => {
  function upload() {
    const form = new FormData();
    form.append("files", new File(["Refund policy notes for the support team. ".repeat(5)], "notes.txt", { type: "text/plain" }));
    return uploadAttachments(
      new NextRequest("http://localhost/api/v1/assistant/attachments", { method: "POST", body: form }),
    );
  }

  it("refuses a member and stores nothing", async () => {
    setIdentityAdapter(as("member"));
    const res = await upload();
    expect(res.status).toBe(403);
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it("gets past the role check for an owner", async () => {
    setIdentityAdapter(as("owner"));
    vi.mocked(createAttachment).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      filename: "notes.txt",
      sizeBytes: 10,
    } as Awaited<ReturnType<typeof createAttachment>>);
    const res = await upload();
    expect(res.status).toBe(200);
    expect(createAttachment).toHaveBeenCalledOnce();
  });
});
