import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, organizations, workerProfiles } from "@/db/schema";
import { POST } from "@/app/api/v1/chat/conversations/route";
import { GET as getMessages } from "@/app/api/v1/chat/messages/route";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { issueRememberToken } from "@/lib/remembered-customer";

// The history drawer in the website chat: a customer who verified their email sees their own earlier chats,
// from the last 30 days, and nobody else's. Anyone without a verified address gets nothing.

const previous = getIdentityAdapter();
let orgId: string;
let otherOrgId: string;

function adapter(widgetOrg: string | null) {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: "m", role: "owner" as const, source: "test" }),
    resolveWidgetRequest: async () => (widgetOrg ? { orgId: widgetOrg, userId: "widget", role: "member" as const, source: "widget" as const } : null),
  };
}

type Listed = { available: boolean; conversations: { id: string; title: string; resolved: boolean; waiting_for_team: boolean; ticket_key: string | null; last_message_at: string }[] };
const list = async (body: Record<string, unknown>, withToken = true): Promise<{ status: number; json: Listed }> => {
  const res = await POST(
    new NextRequest("http://x/api/v1/chat/conversations", {
      method: "POST",
      headers: withToken ? { "x-worker-site-token": "token" } : {},
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Listed };
};

const DAY = 24 * 60 * 60 * 1000;

async function chat(
  overrides: Partial<{ email: string; verified: boolean; status: string; ticket: string; subject: string; channel: string; org: string; daysAgo: number; customerMessage: boolean }> = {},
) {
  const {
    email = "dana@example.com",
    verified = true,
    status = "open",
    ticket,
    subject = "I can't log in to Parallels",
    channel = "widget",
    org = orgId,
    daysAgo = 0,
    customerMessage = true,
  } = overrides;
  const row = await insertConversationWithTicket({
    organizationId: org,
    channel,
    status,
    subject,
    customerName: "Dana",
    customerEmail: email,
    ...(verified ? { customerEmailVerifiedAt: new Date(), identitySource: "email_code" } : {}),
    ...(ticket ? { externalTicketKey: ticket } : {}),
  });
  const at = Date.now() - daysAgo * DAY;
  await db.insert(messages).values([
    ...(customerMessage ? [{ conversationId: row.id, senderType: "customer", senderName: "Dana", body: subject, createdAt: new Date(at) }] : []),
    { conversationId: row.id, senderType: "agent", senderName: "Eva", body: "Let me help.", createdAt: new Date(at + 1000) },
  ]);
  return row;
}

async function setMode(mode: string) {
  await getOrCreateProfile(orgId);
  await db.update(workerProfiles).set({ identityMode: mode }).where(eq(workerProfiles.organizationId, orgId));
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  otherOrgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "History org");
  await ensureOrganization(otherOrgId, "Other history org");
  await setMode("email_code");
  setIdentityAdapter(adapter(orgId));
});
afterEach(async () => {
  setIdentityAdapter(previous);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(organizations).where(eq(organizations.id, otherOrgId));
});

describe("a verified customer's chat history", () => {
  it("lists the customer's own chats, newest first, when asked from a verified chat", async () => {
    const older = await chat({ subject: "Password reset", daysAgo: 10, status: "resolved" });
    const current = await chat({ subject: "Parallels login fails", ticket: "SDS-31", status: "needs_human" });
    const { status, json } = await list({ conversation_id: current.id });
    expect(status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.conversations.map((c) => c.id)).toEqual([current.id, older.id]);
    expect(json.conversations[0]).toMatchObject({ title: "Parallels login fails", ticket_key: "SDS-31", waiting_for_team: true, resolved: false });
    expect(json.conversations[1]).toMatchObject({ title: "Password reset", resolved: true, waiting_for_team: false, ticket_key: null });
  });

  it("says when each chat last had a message, from its own messages", async () => {
    const older = await chat({ subject: "Password reset", daysAgo: 10 });
    const current = await chat({ subject: "Parallels login fails" });
    const { json } = await list({ conversation_id: current.id });
    const at = (id: string) => new Date(json.conversations.find((c) => c.id === id)!.last_message_at).getTime();
    expect(Math.abs(at(current.id) - Date.now())).toBeLessThan(60_000);
    expect(Math.abs(at(older.id) - (Date.now() - 10 * DAY))).toBeLessThan(60_000);
  });

  it("lists them from a device remembered after an earlier verified visit, with no chat open yet", async () => {
    const earlier = await chat({ daysAgo: 3 });
    const token = issueRememberToken(orgId, { email: "dana@example.com", name: "Dana" });
    const { json } = await list({ remember_token: token });
    expect(json.available).toBe(true);
    expect(json.conversations.map((c) => c.id)).toEqual([earlier.id]);
  });

  it("matches the address whatever its capitals", async () => {
    const mine = await chat({ email: "Dana@Example.com" });
    const { json } = await list({ conversation_id: (await chat({ email: "dana@example.com" })).id });
    expect(json.conversations.map((c) => c.id)).toContain(mine.id);
  });

  it("leaves out other customers, unverified chats, other channels, other organizations, archived chats, chats older than 30 days and chats the customer never wrote in", async () => {
    const current = await chat();
    await chat({ email: "someone.else@example.com" });
    await chat({ verified: false });
    await chat({ channel: "email" });
    await chat({ org: otherOrgId });
    const archived = await chat({ subject: "Archived chat" });
    await db.update(conversations).set({ archived: true }).where(eq(conversations.id, archived.id));
    await chat({ daysAgo: 31, subject: "Too old" });
    await chat({ customerMessage: false, subject: "Never wrote" });
    const inside = await chat({ daysAgo: 29, subject: "Inside the window" });
    const { json } = await list({ conversation_id: current.id });
    expect(json.conversations.map((c) => c.id).sort()).toEqual([current.id, inside.id].sort());
  });

  it("shortens a long first message to a title", async () => {
    const long = await chat({ subject: `I need help with ${"the Parallels connection ".repeat(8)}` });
    const { json } = await list({ conversation_id: long.id });
    expect(json.conversations[0].title.length).toBeLessThanOrEqual(60);
    expect(json.conversations[0].title.endsWith("...")).toBe(true);
  });

  it("titles a chat by the customer's first message when its subject is only the placeholder the identity step leaves", async () => {
    const opened = await insertConversationWithTicket({
      organizationId: orgId,
      channel: "widget",
      subject: "New chat",
      customerName: "Dana",
      customerEmail: "dana@example.com",
      customerEmailVerifiedAt: new Date(),
      identitySource: "email_code",
    });
    const at = Date.now();
    await db.insert(messages).values([
      { conversationId: opened.id, senderType: "customer", senderName: "Dana", body: "How do I\n reset my password?", createdAt: new Date(at) },
      { conversationId: opened.id, senderType: "agent", senderName: "Eva", body: "Let me help.", createdAt: new Date(at + 1000) },
    ]);
    const { json } = await list({ conversation_id: opened.id });
    expect(json.conversations.find((c) => c.id === opened.id)?.title).toBe("How do I reset my password?");
  });

  it("keeps a real subject over the first message", async () => {
    const real = await chat({ subject: "Parallels login fails" });
    const { json } = await list({ conversation_id: real.id });
    expect(json.conversations.find((c) => c.id === real.id)?.title).toBe("Parallels login fails");
  });

  it("shows at most 30 chats", async () => {
    const current = await chat();
    for (let i = 0; i < 32; i++) await chat({ subject: `Chat ${i}`, daysAgo: 1 });
    const { json } = await list({ conversation_id: current.id });
    expect(json.conversations).toHaveLength(30);
    expect(json.conversations[0].id).toBe(current.id);
  });
});

describe("who gets no history", () => {
  it("a chat whose email was only typed, never verified", async () => {
    const typed = await chat({ verified: false });
    expect((await list({ conversation_id: typed.id })).json).toEqual({ available: false, conversations: [] });
  });

  it("a forged, expired or other organization's device token", async () => {
    await chat();
    expect((await list({ remember_token: "not.a.token" })).json.available).toBe(false);
    const expired = issueRememberToken(orgId, { email: "dana@example.com", name: null }, Date.now() - 100 * DAY);
    expect((await list({ remember_token: expired })).json.available).toBe(false);
    const foreign = issueRememberToken(otherOrgId, { email: "dana@example.com", name: null });
    expect((await list({ remember_token: foreign })).json.available).toBe(false);
  });

  it("a conversation id from another organization", async () => {
    const foreign = await chat({ org: otherOrgId });
    expect((await list({ conversation_id: foreign.id })).json.available).toBe(false);
  });

  it("any visitor when the organization does not ask for an emailed code", async () => {
    const current = await chat();
    const token = issueRememberToken(orgId, { email: "dana@example.com", name: null });
    await setMode("email_match");
    expect((await list({ conversation_id: current.id })).json.available).toBe(false);
    expect((await list({ remember_token: token })).json.available).toBe(false);
  });

  it("a request with nothing to prove who it is", async () => {
    await chat();
    expect((await list({})).json).toEqual({ available: false, conversations: [] });
    expect((await list({ conversation_id: "not-an-id" })).json.available).toBe(false);
  });

  it("a request without a valid site token, or from a manager's sign-in instead of the widget", async () => {
    const current = await chat();
    setIdentityAdapter(adapter(null));
    expect((await list({ conversation_id: current.id })).status).toBe(401);
    setIdentityAdapter(adapter(orgId));
    expect((await list({ conversation_id: current.id }, false)).status).toBe(401);
  });
});

describe("opening an earlier chat", () => {
  it("reads it through the same route the chat already uses, and says which ticket it has", async () => {
    const earlier = await chat({ subject: "Password reset", ticket: "SDS-12", status: "resolved", daysAgo: 5 });
    const res = await getMessages(new NextRequest(`http://x/api/v1/chat/messages?conversation_id=${earlier.id}`, { headers: { "x-worker-site-token": "token" } }));
    const body = (await res.json()) as { status: string; ticket_key: string | null; messages: { body: string }[] };
    expect(body.status).toBe("resolved");
    expect(body.ticket_key).toBe("SDS-12");
    expect(body.messages.map((m) => m.body)).toEqual(["Password reset", "Let me help."]);
  });
});
