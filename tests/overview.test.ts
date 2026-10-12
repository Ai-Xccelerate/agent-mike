import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { computeOverview } from "@/lib/overview";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";
import { eq } from "drizzle-orm";

vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskBreakdownSource: vi.fn(),
}));

const sourceMock = vi.mocked(helpdeskBreakdownSource);
const NOW = new Date("2026-10-13T12:00:00Z");
let orgId: string;

async function conversation(
  values: Partial<typeof conversations.$inferInsert> & { channel: string },
  thread: { senderType: string; body: string; citations?: string[] }[],
) {
  const row = await insertConversationWithTicket({ organizationId: orgId, customerName: "Dana", ...values });
  for (const message of thread) {
    await db.insert(messages).values({ conversationId: row.id, senderName: message.senderType, citations: [], ...message });
  }
  return row;
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Overview org");
  sourceMock.mockReset();
  sourceMock.mockResolvedValue({
    project: "EAPR",
    types: ["Report a Bug", "System Unavailable", "Training Request"],
    priorities: ["Critical", "High", "Medium", "Low", "Informational"],
  });

  const hourAgo = new Date(NOW.getTime() - 60 * 60 * 1000);
  // Answered from an article.
  await conversation({ channel: "widget", createdAt: hourAgo, status: "open" }, [
    { senderType: "customer", body: "I can't log in this morning" },
    { senderType: "agent", body: "Try the reset steps", citations: ["How to reset your EAPx Cloud password"] },
  ]);
  // Handed over with a ticket.
  await conversation(
    {
      channel: "widget",
      createdAt: new Date(NOW.getTime() - 30 * 60 * 1000),
      status: "needs_human",
      externalTicketKey: "EAPR-5",
      externalTicketType: "System Unavailable",
      externalTicketPriority: "Critical",
    },
    [
      { senderType: "customer", body: "Nobody in our office can log in" },
      { senderType: "agent", body: "Bringing in the team" },
    ],
  );
  // Handed over by email, no ticket.
  await conversation({ channel: "email", createdAt: new Date(hourAgo.getTime() - 60 * 1000), status: "needs_human", subject: "Invoice question" }, [
    { senderType: "customer", body: "Our invoice looks wrong" },
  ]);
  // Not counted: the Playground, an archived one, and one from last month.
  await conversation({ channel: "chat", createdAt: hourAgo }, [{ senderType: "customer", body: "test" }]);
  await conversation({ channel: "widget", createdAt: hourAgo, archived: true }, [{ senderType: "customer", body: "old" }]);
  await conversation({ channel: "widget", createdAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000) }, [
    { senderType: "customer", body: "ancient" },
  ]);
});

describe("the Overview's numbers", () => {
  it("counts real customer conversations in the period, and what the worker did with them", async () => {
    const overview = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: 4, now: NOW });

    expect(overview.conversations).toEqual({ total: 3, byChannel: { widget: 2, email: 1 } });
    expect(overview.answeredByWorker).toBe(1);
    expect(overview.handedOver).toBe(2);
    expect(overview.firstReply).toEqual({ targetHours: 4, measured: null });
  });

  it("breaks tickets down by the desk's own request types and priorities, zeros included", async () => {
    const overview = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null, now: NOW });

    expect(overview.tickets.raised).toBe(1);
    expect(overview.tickets.helpdesk).toEqual({ project: "EAPR" });
    expect(overview.tickets.byType).toEqual([
      { name: "Report a Bug", count: 0 },
      { name: "System Unavailable", count: 1 },
      { name: "Training Request", count: 0 },
    ]);
    expect(overview.tickets.byPriority.map((entry) => entry.count)).toEqual([1, 0, 0, 0, 0]);
    expect(overview.handedOverTopics).toEqual([]);
  });

  it("shows what was handed over by topic when no helpdesk is connected", async () => {
    sourceMock.mockResolvedValue(null);
    const overview = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null, now: NOW });

    expect(overview.tickets.helpdesk).toBeNull();
    expect(overview.tickets.byType).toEqual([{ name: "System Unavailable", count: 1 }]);
    expect(overview.handedOverTopics).toContain("Invoice question");
  });

  it("says what the worker did with each recent conversation", async () => {
    const overview = await computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null, now: NOW });

    expect(overview.recent.map((entry) => [entry.asked, entry.outcome])).toEqual([
      ["Nobody in our office can log in", { kind: "ticket", key: "EAPR-5", type: "System Unavailable" }],
      ["I can't log in this morning", { kind: "answered", source: "How to reset your EAPx Cloud password" }],
      ["Our invoice looks wrong", { kind: "handed_over" }],
    ]);
  });

  it("widens with the period", async () => {
    const overview = await computeOverview({ organizationId: orgId, period: "30d", firstReplyTargetHours: null, now: NOW });
    expect(overview.conversations.total).toBe(3);
    const longer = await db.select().from(conversations).where(eq(conversations.organizationId, orgId));
    expect(longer.length).toBe(6);
  });
});
