import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, organizations } from "@/db/schema";
import { GET } from "@/app/api/v1/chat/messages/route";
import { POST as managerReply } from "@/app/api/v1/conversations/[id]/messages/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { currentStaffName, mergeWidgetHistory, newFromServer, sameMessages } from "../frontend/src/lib/widget-history";

const previous = getIdentityAdapter();
let orgId: string;
let otherOrgId: string;

/** A widget request carries the site token; here the token names whichever organization the test chose. */
function adapter(widgetOrg: string | null) {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: "m", role: "owner" as const, source: "test" }),
    resolveWidgetRequest: async () => (widgetOrg ? { orgId: widgetOrg, userId: "widget", role: "member" as const, source: "widget" as const } : null),
  };
}
const get = (query: string) =>
  GET(new NextRequest(`http://x/api/v1/chat/messages${query}`, { headers: { "x-worker-site-token": "token" } }));

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  otherOrgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Widget org");
  await ensureOrganization(otherOrgId, "Other widget org");
  setIdentityAdapter(adapter(orgId));
});
afterEach(async () => {
  setIdentityAdapter(previous);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(organizations).where(eq(organizations.id, otherOrgId));
});

async function chat(channel = "widget") {
  const row = await insertConversationWithTicket({ organizationId: orgId, channel, customerName: "Dana" });
  // Explicit, increasing times: rows from one statement share a timestamp, and the order read back must not depend on luck.
  const start = Date.now() - 60_000;
  await db.insert(messages).values([
    { conversationId: row.id, senderType: "customer", senderName: "Dana", body: "I need a human", createdAt: new Date(start) },
    { conversationId: row.id, senderType: "agent", senderName: "Eva", body: "I'll get someone.", createdAt: new Date(start + 1000) },
  ]);
  return row;
}

describe("what the website chat reads from the server", () => {
  it("returns the whole conversation, so a reload shows it all", async () => {
    const row = await chat();
    const res = await get(`?conversation_id=${row.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: { senderType: string; body: string }[]; status: string };
    expect(body.messages.map((message) => message.body)).toEqual(["I need a human", "I'll get someone."]);
  });

  it("shows a manager's reply to the visitor, in order, once the manager has sent it", async () => {
    const row = await chat();
    const reply = await managerReply(
      new NextRequest(`http://x/api/v1/conversations/${row.id}/messages`, { method: "POST", body: JSON.stringify({ body: "Hi Dana, I'm here." }) }),
      { params: { id: row.id } },
    );
    expect(reply.status).toBe(200);
    const body = (await (await get(`?conversation_id=${row.id}`)).json()) as { messages: { senderType: string; body: string; senderName: string }[]; human_controlled: boolean };
    expect(body.messages.map((message) => message.senderType)).toEqual(["customer", "agent", "manager"]);
    expect(body.messages[2]).toMatchObject({ body: "Hi Dana, I'm here." });
    expect(body.human_controlled).toBe(true);
  });

  it("returns only what a visitor already sees", async () => {
    const row = await chat();
    const body = (await (await get(`?conversation_id=${row.id}`)).json()) as { messages: Record<string, unknown>[] };
    expect(Object.keys(body.messages[0]).sort()).toEqual(["body", "cards", "citations", "conversationId", "createdAt", "id", "senderName", "senderType"]);
  });

  it("is closed to other organizations' tokens, other channels, bad ids and no token", async () => {
    const row = await chat();
    setIdentityAdapter(adapter(otherOrgId));
    expect((await get(`?conversation_id=${row.id}`)).status).toBe(404);
    setIdentityAdapter(adapter(orgId));
    expect((await get(`?conversation_id=${(await chat("email")).id}`)).status).toBe(404);
    expect((await get(`?conversation_id=${(await chat("assistant")).id}`)).status).toBe(404);
    expect((await get("?conversation_id=not-an-id")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    setIdentityAdapter(adapter(null));
    expect((await get(`?conversation_id=${row.id}`)).status).toBe(401);
  });
});

describe("merging the server's copy into the open chat", () => {
  const message = (id: string, senderType: "customer" | "agent" | "manager" = "agent", senderName = "Eva") =>
    ({ id, conversationId: "c", senderType, senderName, body: id, citations: [], createdAt: "2026-10-28T10:00:00Z" }) as const;
  const welcome = message("welcome");

  it("puts the welcome first, takes the server's messages, and keeps the failed-turn note", () => {
    const local = [welcome, message("customer-123", "customer", "You"), message("fallback-9")];
    const merged = mergeWidgetHistory([message("a", "customer"), message("b")], [...local], welcome);
    expect(merged.map((item) => item.id)).toEqual(["welcome", "a", "b", "fallback-9"]);
  });

  it("changes nothing when nothing is new, so a quiet check does not redraw the chat", () => {
    const shown = [welcome, message("a"), message("b")];
    expect(sameMessages(mergeWidgetHistory([message("a"), message("b")], shown, welcome), shown)).toBe(true);
    expect(newFromServer([message("a"), message("c", "manager", "Priya")], shown).map((item) => item.id)).toEqual(["c"]);
  });

  it("names whoever from the team has the conversation", () => {
    expect(currentStaffName([message("a"), message("c", "manager", "Priya")])).toBe("Priya");
    expect(currentStaffName([message("a")])).toBeNull();
  });
});
