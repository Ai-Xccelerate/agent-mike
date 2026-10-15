import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { computeTickets, inQueue } from "@/lib/tickets";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter, type TenantContext } from "@/lib/identity";
import { GET as getTickets } from "@/app/api/v1/tickets/route";
import { PATCH as patchConversation } from "@/app/api/v1/conversations/[id]/route";

vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskBreakdownSource: vi.fn(),
}));

const sourceMock = vi.mocked(helpdeskBreakdownSource);
const NOW = new Date("2026-10-15T12:00:00Z");
const previousAdapter = getIdentityAdapter();
let orgId: string;

function as(role: TenantContext["role"]): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: `user-${role}`, role, source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

async function ticket(
  values: Partial<typeof conversations.$inferInsert> & { channel: string },
  thread: { senderType: string; body: string }[] = [],
) {
  const row = await insertConversationWithTicket({ organizationId: orgId, customerName: "Dana", ...values });
  for (const message of thread) {
    await db.insert(messages).values({ conversationId: row.id, senderName: message.senderType, citations: [], ...message });
  }
  return row;
}

const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Tickets org");
  sourceMock.mockReset();
  sourceMock.mockResolvedValue({
    project: "EAPR",
    types: ["Report a Bug", "System Unavailable", "Training Request"],
    priorities: ["Critical", "High"],
  });
});

afterEach(() => setIdentityAdapter(previousAdapter));

describe("computeTickets", () => {
  it("sorts every customer conversation into queues by status and handler", async () => {
    await ticket({ channel: "widget", updatedAt: ago(10) }, [{ senderType: "customer", body: "hi" }, { senderType: "agent", body: "hello" }]);
    await ticket({ channel: "widget", status: "needs_human", updatedAt: ago(5) });
    await ticket({ channel: "email", humanControlled: true, updatedAt: ago(20) });
    await ticket({ channel: "widget", status: "resolved", updatedAt: ago(60) });
    await ticket({ channel: "widget", status: "closed", updatedAt: ago(90) });

    const { queues } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(queues).toEqual({ all_open: 3, needs_human: 1, worker: 1, human: 2, closed: 2 });
  });

  it("leaves out the Playground, the Assistant, archived conversations and other orgs", async () => {
    await ticket({ channel: "widget" });
    await ticket({ channel: "chat" });
    await ticket({ channel: "assistant" });
    await ticket({ channel: "widget", archived: true });
    const otherOrg = `org-${crypto.randomUUID()}`;
    await ensureOrganization(otherOrg, "Other");
    await insertConversationWithTicket({ organizationId: otherOrg, customerName: "X", channel: "widget" });

    const { tickets } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].channel).toBe("widget");
  });

  it("shows the worker's own request type first, else the helpdesk's, and the helpdesk key as a link", async () => {
    await ticket({
      channel: "widget",
      status: "needs_human",
      externalTicketKey: "EAPR-5",
      externalTicketType: "System Unavailable",
      externalTicketPriority: "Critical",
    });
    await ticket({ channel: "widget", requestType: "Billing question", externalTicketType: "Report a Bug" });
    await ticket({ channel: "widget" });

    const { tickets } = await computeTickets({ organizationId: orgId, now: NOW });
    const byType = Object.fromEntries(tickets.map((t) => [t.requestType ?? "none", t]));
    expect(byType["System Unavailable"].externalTicketKey).toBe("EAPR-5");
    expect(byType["System Unavailable"].priority).toBe("Critical");
    expect(byType["Billing question"]).toBeDefined();
    expect(byType["none"].priority).toBeNull();
  });

  it("adds labels the state implies and keeps stored ones without duplicates", async () => {
    await ticket({
      channel: "widget",
      status: "needs_human",
      labels: ["urgent", "needs-human"],
      externalTicketKey: "EAPR-6",
      externalTicketError: "Jira refused",
    });
    const { tickets } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(tickets[0].labels.sort()).toEqual(["handed-over", "needs-human", "ticket-failed", "urgent"]);
    // A needs-human status alone adds no label: the status column says it.
    await ticket({ channel: "widget", status: "needs_human" });
    const { tickets: all } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(all.find((t) => t.externalTicketKey === null)?.labels).toEqual([]);
  });

  it("counts what the worker handled in the last 24 hours, not handed-over or silent conversations", async () => {
    const answered = await ticket({ channel: "widget", updatedAt: ago(30) }, [
      { senderType: "customer", body: "how do I reset" },
      { senderType: "agent", body: "like this" },
    ]);
    await ticket({ channel: "widget", updatedAt: ago(30) }, [{ senderType: "customer", body: "anyone there" }]);
    await ticket({ channel: "widget", status: "needs_human", updatedAt: ago(30) }, [{ senderType: "agent", body: "handing over" }]);
    await ticket({ channel: "widget", updatedAt: ago(60 * 30) }, [{ senderType: "agent", body: "old answer" }]);
    await ticket({ channel: "widget", status: "needs_human", externalTicketKey: "EAPR-7", createdAt: ago(60) });
    await ticket({ channel: "widget", status: "needs_human", externalTicketKey: "EAPR-1", createdAt: ago(60 * 48) });

    const { kpis, sampleIds } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(kpis.workerHandledToday).toBe(1);
    expect(sampleIds).toEqual([answered.id]);
    expect(kpis.raisedToday).toBe(1);
    expect(kpis.needsHuman).toBe(3);
  });

  it("lists the helpdesk's request types with zeros, then others in use, counting open tickets only", async () => {
    await ticket({ channel: "widget", requestType: "Report a Bug" });
    await ticket({ channel: "widget", requestType: "Report a Bug", status: "resolved" });
    await ticket({ channel: "widget", requestType: "Custom thing" });

    const { requestTypes, helpdesk } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(helpdesk).toEqual({ project: "EAPR" });
    expect(requestTypes).toEqual([
      { name: "Report a Bug", count: 1 },
      { name: "System Unavailable", count: 0 },
      { name: "Training Request", count: 0 },
      { name: "Custom thing", count: 1 },
    ]);
  });

  it("works with no helpdesk connected", async () => {
    sourceMock.mockResolvedValue(null);
    await ticket({ channel: "widget", requestType: "Billing question" });
    const { requestTypes, helpdesk, tickets } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(helpdesk).toBeNull();
    expect(requestTypes).toEqual([{ name: "Billing question", count: 1 }]);
    expect(tickets).toHaveLength(1);
  });

  it("survives a helpdesk that throws", async () => {
    sourceMock.mockRejectedValue(new Error("Jira is down"));
    await ticket({ channel: "widget" });
    const { tickets, helpdesk } = await computeTickets({ organizationId: orgId, now: NOW });
    expect(tickets).toHaveLength(1);
    expect(helpdesk).toBeNull();
  });
});

describe("inQueue", () => {
  it("treats a handed-over open ticket as the human's, not the worker's", () => {
    expect(inQueue({ status: "open", handler: "human" }, "worker")).toBe(false);
    expect(inQueue({ status: "open", handler: "human" }, "human")).toBe(true);
    expect(inQueue({ status: "resolved", handler: "human" }, "human")).toBe(false);
  });
});

describe("GET /api/v1/tickets", () => {
  it("returns the payload for the caller's own org", async () => {
    setIdentityAdapter(as("member"));
    await ticket({ channel: "widget", requestType: "Report a Bug" });
    const res = await getTickets(new NextRequest("http://localhost/api/v1/tickets"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tickets: Record<string, unknown>[]; queues: { all_open: number } };
    expect(body.tickets).toHaveLength(1);
    expect(body.queues.all_open).toBe(1);
    expect(body.tickets[0].messages).toBeUndefined();
  });
});

describe("PATCH classification", () => {
  function patch(id: string, body: unknown) {
    return patchConversation(
      new NextRequest(`http://localhost/api/v1/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: { id } },
    );
  }

  it("lets an admin set and clear request type, tier and labels", async () => {
    setIdentityAdapter(as("admin"));
    const row = await ticket({ channel: "widget" });
    const set = await patch(row.id, { requestType: " Billing ", tier: "Tier 2", labels: ["urgent", "urgent", " vip "] });
    expect(set.status).toBe(200);
    const [saved] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(saved.requestType).toBe("Billing");
    expect(saved.tier).toBe("Tier 2");
    expect(saved.labels).toEqual(["urgent", "vip"]);

    const cleared = await patch(row.id, { requestType: null, tier: null, labels: [] });
    expect(cleared.status).toBe(200);
    const [after] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(after.requestType).toBeNull();
    expect(after.tier).toBeNull();
    expect(after.labels).toEqual([]);
  });

  it("refuses members, blank values and too many labels", async () => {
    const row = await ticket({ channel: "widget" });
    setIdentityAdapter(as("member"));
    expect((await patch(row.id, { tier: "Tier 1" })).status).toBe(403);

    setIdentityAdapter(as("admin"));
    expect((await patch(row.id, { requestType: "   " })).status).toBe(400);
    expect((await patch(row.id, { tier: "x".repeat(81) })).status).toBe(400);
    expect((await patch(row.id, { labels: Array.from({ length: 21 }, (_, i) => `l${i}`) })).status).toBe(400);
    expect((await patch(row.id, { labels: "urgent" })).status).toBe(400);
    expect((await patch(row.id, {})).status).toBe(400);
  });
});
