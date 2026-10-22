/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { answerFeedback, conversations, messages, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { feedbackInputSchema, feedbackSummary } from "@/lib/answer-feedback";
import { computeOverview } from "@/lib/overview";
import { DELETE as deleteFeedback, POST as postFeedback } from "@/app/api/v1/messages/[id]/feedback/route";
import { GET as getConversation } from "@/app/api/v1/conversations/[id]/route";

vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskBreakdownSource: vi.fn(async () => null),
  backfillFromJira: vi.fn(),
}));

const previousAdapter = getIdentityAdapter();
const adapter: IdentityAdapter = {
  resolveManagerRequest: async (req) => ({
    orgId: req.headers.get("x-test-org") ?? "none",
    userId: req.headers.get("x-test-user") ?? "manager-a",
    role: "member",
    source: "test",
  }),
  resolveWidgetRequest: async () => null,
};

let orgId: string;
let otherOrgId: string;

function req(method: string, url: string, body: unknown, as: { org?: string; user?: string } = {}) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "x-test-org": as.org ?? orgId, "x-test-user": as.user ?? "manager-a" },
    body: body === undefined ? undefined : JSON.stringify(body),
    duplex: "half",
  } as any);
}
const rate = (messageId: string, body: unknown, as?: { org?: string; user?: string }) =>
  postFeedback(req("POST", `http://t/api/v1/messages/${messageId}/feedback`, body, as), { params: { id: messageId } });

async function thread(org = orgId, channel = "widget") {
  const conversation = await insertConversationWithTicket({ organizationId: org, channel, customerName: "Dana" });
  const [customer] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "customer", senderName: "Dana", body: "What do the priorities mean?" }).returning();
  const [agent] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "agent", senderName: "Eva", body: "Critical means the system is down." }).returning();
  const [manager] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "manager", senderName: "Charan", body: "Following up." }).returning();
  return { conversation, customer, agent, manager };
}

beforeEach(async () => {
  setIdentityAdapter(adapter);
  orgId = `fb-${crypto.randomUUID()}`;
  otherOrgId = `fb-other-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await ensureOrganization(otherOrgId, otherOrgId);
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(organizations).where(eq(organizations.id, otherOrgId));
});

describe("what a rating may hold", () => {
  it("drops reasons and a correction from a good rating, since they only describe what went wrong", () => {
    expect(feedbackInputSchema.parse({ rating: "good", reasons: ["unsafe"], correction: "x" })).toEqual({ rating: "good", reasons: [], correction: null });
  });

  it("keeps reasons once each, and trims the correction", () => {
    expect(feedbackInputSchema.parse({ rating: "bad", reasons: ["wrong_answer", "wrong_answer", "unsafe"], correction: "  It should say High.  " })).toEqual({
      rating: "bad",
      reasons: ["wrong_answer", "unsafe"],
      correction: "It should say High.",
    });
    expect(feedbackInputSchema.parse({ rating: "bad", correction: "   " }).correction).toBeNull();
  });

  it("refuses a made-up reason, a made-up rating and an essay", () => {
    expect(feedbackInputSchema.safeParse({ rating: "bad", reasons: ["rude"] }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ rating: "meh" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ rating: "bad", correction: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("POST /api/v1/messages/:id/feedback", () => {
  it("saves a bad rating with its reasons, its correction and what the worker was running", async () => {
    const { agent, conversation } = await thread();
    const res = await rate(agent.id, { rating: "bad", reasons: ["wrong_answer"], correction: "Critical also covers no one being able to sign in." });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ messageId: agent.id, rating: "bad", reasons: ["wrong_answer"], mine: true });
    const [row] = await db.select().from(answerFeedback).where(eq(answerFeedback.messageId, agent.id));
    expect(row).toMatchObject({ organizationId: orgId, conversationId: conversation.id, ratedBy: "manager-a", correction: "Critical also covers no one being able to sign in." });
    expect(row.context).toMatchObject({ model: expect.any(String), identityMode: "off", outputGuardrailMode: expect.stringMatching(/always|risk/) });
  });

  it("lets the same manager change their mind without adding a second rating", async () => {
    const { agent } = await thread();
    await rate(agent.id, { rating: "bad", reasons: ["wrong_answer"] });
    const changed = await rate(agent.id, { rating: "good" });

    expect(await changed.json()).toMatchObject({ rating: "good", reasons: [], correction: null });
    expect(await db.select().from(answerFeedback).where(eq(answerFeedback.messageId, agent.id))).toHaveLength(1);
  });

  it("keeps each manager's rating of the same reply separate", async () => {
    const { agent } = await thread();
    await rate(agent.id, { rating: "good" }, { user: "manager-a" });
    await rate(agent.id, { rating: "bad", reasons: ["unsafe"] }, { user: "manager-b" });

    expect(await db.select().from(answerFeedback).where(eq(answerFeedback.messageId, agent.id))).toHaveLength(2);
  });

  it("only rates the worker's own replies: not the customer's, a manager's, or a reply in the admin Assistant", async () => {
    const { customer, manager } = await thread();
    expect((await rate(customer.id, { rating: "good" })).status).toBe(404);
    expect((await rate(manager.id, { rating: "good" })).status).toBe(404);
    const assistant = await thread(orgId, "assistant");
    expect((await rate(assistant.agent.id, { rating: "good" })).status).toBe(404);
    expect(await db.select().from(answerFeedback).where(eq(answerFeedback.organizationId, orgId))).toEqual([]);
  });

  it("treats another organization's reply, and nonsense, as not found", async () => {
    const foreign = await thread(otherOrgId);
    expect((await rate(foreign.agent.id, { rating: "good" })).status).toBe(404);
    expect((await rate("not-a-uuid", { rating: "good" })).status).toBe(404);
    expect((await rate(crypto.randomUUID(), { rating: "good" })).status).toBe(404);
  });

  it("explains what is wrong with a rating", async () => {
    const { agent } = await thread();
    const res = await rate(agent.id, { rating: "bad", reasons: ["rude"] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Check the rating" });
  });
});

describe("taking a rating back", () => {
  it("removes only the signed-in manager's own", async () => {
    const { agent } = await thread();
    await rate(agent.id, { rating: "good" }, { user: "manager-a" });
    await rate(agent.id, { rating: "good" }, { user: "manager-b" });

    const del = (user: string) => deleteFeedback(req("DELETE", `http://t/api/v1/messages/${agent.id}/feedback`, undefined, { user }), { params: { id: agent.id } });
    expect((await del("manager-a")).status).toBe(200);
    expect((await del("manager-a")).status).toBe(404);
    expect((await db.select().from(answerFeedback).where(eq(answerFeedback.messageId, agent.id))).map((row) => row.ratedBy)).toEqual(["manager-b"]);
  });
});

describe("the conversation carries its ratings", () => {
  it("flags the viewer's own", async () => {
    const { agent, conversation } = await thread();
    await rate(agent.id, { rating: "good" }, { user: "manager-a" });
    await rate(agent.id, { rating: "bad", reasons: ["wrong_priority"] }, { user: "manager-b" });

    const asA: any = await (await getConversation(req("GET", `http://t/api/v1/conversations/${conversation.id}`, undefined, { user: "manager-a" }), { params: { id: conversation.id } })).json();
    expect(asA.feedback.map((entry: any) => [entry.rating, entry.mine]).sort()).toEqual([["bad", false], ["good", true]]);
  });
});

describe("answer quality on the Overview", () => {
  async function seed() {
    const first = await thread();
    const second = await thread();
    await rate(first.agent.id, { rating: "good" }, { user: "manager-a" });
    await rate(first.agent.id, { rating: "bad", reasons: ["wrong_answer", "unsafe"] }, { user: "manager-b" });
    await rate(second.agent.id, { rating: "bad", reasons: ["wrong_answer"] }, { user: "manager-a" });
    return { first, second };
  }

  it("counts ratings and what was wrong, most common first", async () => {
    const { first, second } = await seed();
    const summary = await feedbackSummary(orgId, [first.conversation.id, second.conversation.id]);

    expect(summary).toEqual({ rated: 3, good: 1, bad: 2, byReason: [{ reason: "wrong_answer", count: 2 }, { reason: "unsafe", count: 1 }] });
    expect(await feedbackSummary(orgId, [])).toEqual({ rated: 0, good: 0, bad: 0, byReason: [] });
  });

  it("covers the period and follows the filters", async () => {
    const { first, second } = await seed();
    await db.update(conversations).set({ channel: "email" }).where(eq(conversations.id, second.conversation.id));

    const all = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null });
    expect(all.quality).toMatchObject({ rated: 3, good: 1, bad: 2 });
    const widgetOnly = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null, filters: { channel: "widget" } });
    expect(widgetOnly.quality).toMatchObject({ rated: 2, good: 1, bad: 1 });

    await db.update(conversations).set({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }).where(eq(conversations.id, first.conversation.id));
    const today = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null });
    expect(today.quality).toMatchObject({ rated: 1, bad: 1 });
  });

  it("is empty when nothing has been rated", async () => {
    await thread();
    const overview = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null });
    expect(overview.quality).toEqual({ rated: 0, good: 0, bad: 0, byReason: [] });
  });
});

describe("the Inbox list carries ratings too", () => {
  it("attaches each conversation's own, in one go", async () => {
    const a = await thread();
    const b = await thread();
    await rate(a.agent.id, { rating: "good" });
    const { GET: list } = await import("@/app/api/v1/conversations/route");

    const rows = (await (await list(req("GET", "http://t/api/v1/conversations", undefined))).json()) as any[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(a.conversation.id).feedback).toMatchObject([{ messageId: a.agent.id, rating: "good", mine: true }]);
    expect(byId.get(b.conversation.id).feedback).toEqual([]);
  });
});
