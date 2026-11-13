import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { addInternalTicketNote, setCriticalTicketPriority } from "@/lib/tools-integrations/atlassian";
import { notifyManager } from "@/lib/handoff-notify";
import { routeHandover } from "@/lib/managers";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));
vi.mock("@/lib/managers", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/managers")>()), routeHandover: vi.fn() }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => null),
  helpdeskRaisesTickets: vi.fn(async () => false),
  helpdeskTicketsEveryConversation: vi.fn(async () => false),
  setCriticalTicketPriority: vi.fn(async () => "Highest"),
  addInternalTicketNote: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));

let orgId: string;
const route = (critical: boolean) => ({ recipients: [{ email: "boss@example.com", name: "Boss", why: "critical" as const }], assignee: null, critical, chosen: null });

beforeEach(async () => {
  orgId = `org-crit-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  runAgentMock.mockReset();
  vi.mocked(routeHandover).mockReset();
  vi.mocked(setCriticalTicketPriority).mockClear();
  vi.mocked(addInternalTicketNote).mockClear();
  vi.mocked(notifyManager).mockClear();
});

async function turn(conversationId: string, body: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Visitor" });
}

const handover = { answer: "I've passed that to the team.", confidence: 0.2, escalate: true, citations: [] };

describe("a handover that turns out to be critical later", () => {
  it("raises the ticket to the top priority and tells the Critical group once", async () => {
    runAgentMock.mockResolvedValue(handover);
    vi.mocked(routeHandover).mockResolvedValue(route(true));
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-7", externalTicketPriority: "Medium" });
    await turn(conversation.id, "nobody in our office can log in now");
    await vi.waitFor(() => expect(setCriticalTicketPriority).toHaveBeenCalledWith(orgId, "SUP-7"));
    await vi.waitFor(() => expect(notifyManager).toHaveBeenCalledTimes(1));
    expect(addInternalTicketNote).toHaveBeenCalled();
  });

  it("does nothing when it is not critical or is already at the top priority", async () => {
    runAgentMock.mockResolvedValue(handover);
    vi.mocked(routeHandover).mockResolvedValue(route(false));
    const calm = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-8", externalTicketPriority: "Medium" });
    await turn(calm.id, "any update?");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(setCriticalTicketPriority).not.toHaveBeenCalled();

    vi.mocked(routeHandover).mockClear();
    vi.mocked(routeHandover).mockResolvedValue(route(true));
    const top = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-9", externalTicketPriority: "Highest" });
    await turn(top.id, "still down");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(routeHandover).not.toHaveBeenCalled();
    expect(setCriticalTicketPriority).not.toHaveBeenCalled();
  });
});
