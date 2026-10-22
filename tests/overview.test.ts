import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { computeOverview, RECENT_PAGE_SIZE } from "@/lib/overview";
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

describe("the Overview's charts and filters", () => {
  const run = (extra: Partial<Parameters<typeof computeOverview>[0]> = {}) =>
    computeOverview({ organizationId: orgId, period: "24h", firstReplyTargetHours: null, now: NOW, ...extra });

  it("splits conversations over time into answered and handed over, in rolling windows ending now", async () => {
    const overview = await run();

    expect(overview.series.bucket).toBe("hour");
    expect(overview.series.points).toHaveLength(24);
    expect(overview.series.points[0].start).toBe(overview.since);
    const sum = (key: "answered" | "handedOver") => overview.series.points.reduce((total, point) => total + point[key], 0);
    expect([sum("answered"), sum("handedOver")]).toEqual([1, 2]);
    // 11:00 and 11:30 fall in the last window (11:00-12:00); the 10:59 email falls in the one before.
    expect(overview.series.points[23]).toMatchObject({ answered: 1, handedOver: 1 });
    expect(overview.series.points[22]).toMatchObject({ answered: 0, handedOver: 1 });
  });

  it("uses days for a week and a month", async () => {
    const week = await run({ period: "7d" });
    const month = await run({ period: "30d" });
    expect([week.series.bucket, week.series.points.length]).toEqual(["day", 7]);
    expect([month.series.bucket, month.series.points.length]).toEqual(["day", 30]);
  });

  it("counts every status, zeros included", async () => {
    const overview = await run();
    expect(overview.byStatus).toEqual([
      { status: "open", count: 1 },
      { status: "needs_human", count: 2 },
      { status: "resolved", count: 0 },
      { status: "closed", count: 0 },
    ]);
  });

  it("lists the sources it cited most, once per conversation", async () => {
    const overview = await run();
    expect(overview.topSources).toEqual([{ title: "How to reset your EAPx Cloud password", count: 1 }]);
  });

  it("says how many are waiting for a person right now: any age, but narrowed by the filters", async () => {
    expect((await run()).waitingNow).toBe(2);
    // Not a period: an older handoff still waiting still counts.
    await conversation({ channel: "widget", createdAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000), status: "needs_human" }, [{ senderType: "customer", body: "Still waiting" }]);
    expect((await run()).waitingNow).toBe(3);
    // Filters apply, so the number beside a filtered tile is about the same conversations.
    expect((await run({ filters: { channel: "email" } })).waitingNow).toBe(1);
    expect((await run({ filters: { requestType: "System Unavailable" } })).waitingNow).toBe(1);
  });

  it("narrows every number together by channel, request type or priority", async () => {
    const byChannel = await run({ filters: { channel: "email" } });
    expect(byChannel.conversations).toEqual({ total: 1, byChannel: { email: 1 } });
    expect(byChannel.series.points.reduce((n, p) => n + p.handedOver, 0)).toBe(1);

    const byType = await run({ filters: { requestType: "System Unavailable" } });
    expect(byType.conversations.total).toBe(1);
    expect(byType.recent.map((entry) => entry.asked)).toEqual(["Nobody in our office can log in"]);
    expect(byType.byStatus.find((entry) => entry.status === "needs_human")?.count).toBe(1);

    const none = await run({ filters: { priority: "Low" } });
    expect(none.conversations.total).toBe(0);
    expect(none.recent).toEqual([]);
    expect(none.filters).toEqual({ channel: null, requestType: null, priority: "Low" });
  });

  it("offers the desk's own request types and priorities as filters, and the channels it has seen", async () => {
    const overview = await run();
    expect(overview.filterOptions.channels).toEqual(["email", "widget"]);
    expect(overview.filterOptions.requestTypes).toEqual(["Report a Bug", "System Unavailable", "Training Request"]);
    expect(overview.filterOptions.priorities).toEqual(["Critical", "High", "Medium", "Low", "Informational"]);

    sourceMock.mockResolvedValue(null);
    const withoutDesk = await run();
    expect(withoutDesk.filterOptions.requestTypes).toEqual(["System Unavailable"]);
  });

  it("still offers what it has seen when the desk's own list is incomplete", async () => {
    sourceMock.mockResolvedValue({ project: "EAPR", types: ["Report a Bug"], priorities: ["High"] });
    const overview = await run();
    expect(overview.filterOptions.requestTypes).toEqual(["Report a Bug", "System Unavailable"]);
    expect(overview.filterOptions.priorities).toEqual(["High", "Critical"]);
  });

  it("pages the activity list", async () => {
    for (let i = 0; i < 12; i++) {
      await conversation({ channel: "widget", createdAt: new Date(NOW.getTime() - (2 + i) * 60 * 1000), status: "open" }, [
        { senderType: "customer", body: `Question ${i}` },
        { senderType: "agent", body: "Answer" },
      ]);
    }
    const first = await run();
    const second = await run({ page: 1 });

    expect(first.recentPage).toEqual({ page: 0, pageSize: RECENT_PAGE_SIZE, total: 15 });
    expect(first.recent).toHaveLength(RECENT_PAGE_SIZE);
    expect(second.recent).toHaveLength(5);
    expect(new Set([...first.recent, ...second.recent].map((entry) => entry.conversationId)).size).toBe(15);
  });
});
