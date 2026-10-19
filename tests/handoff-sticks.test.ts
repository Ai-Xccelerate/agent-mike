import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { promisesPersonFollowUp } from "@/lib/agent";
import { recordHandoffInJira } from "@/lib/tools-integrations/atlassian";
import { summarizeForHandoff } from "@/lib/ticket-classifier";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
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
vi.mock("@/lib/ticket-classifier", () => ({
  classifyConversation: vi.fn(async () => ({ done: false, reason: "not_needed" })),
  summarizeForHandoff: vi.fn(async () => "Dana needs a custom report."),
}));

let orgId: string;

async function turn(conversationId: string, body: string, options: { deferTicket?: boolean } = {}) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Dana", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Dana", ...options });
}
const statusOf = async (id: string) => (await db.select().from(conversations).where(eq(conversations.id, id)))[0].status;

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Handoff sticks org");
  runAgentMock.mockReset();
});

describe("a conversation already waiting for a person", () => {
  it("stays waiting when the customer writes again and the worker does not escalate", async () => {
    runAgentMock.mockResolvedValue({ answer: "Thanks, a teammate has it.", confidence: 0.8, escalate: false, citations: [] });
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human" });
    await turn(row.id, "Thanks");
    expect(await statusOf(row.id)).toBe("needs_human");
  });

  it("still moves an open conversation to waiting when the worker escalates, and leaves an answered one open", async () => {
    const open = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    runAgentMock.mockResolvedValueOnce({ answer: "Bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    await turn(open.id, "Nobody can log in");
    expect(await statusOf(open.id)).toBe("needs_human");

    const answered = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    runAgentMock.mockResolvedValueOnce({ answer: "Go to the sign-in page.", confidence: 0.9, escalate: false, citations: [] });
    await turn(answered.id, "How do I reset my password?");
    expect(await statusOf(answered.id)).toBe("open");
  });

  it("does not undo a conversation a person resolved", async () => {
    runAgentMock.mockResolvedValue({ answer: "Glad that is sorted.", confidence: 0.9, escalate: false, citations: [] });
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "resolved" });
    await turn(row.id, "Thanks");
    expect(await statusOf(row.id)).toBe("open");
  });
});

describe("the handover", () => {
  it("stores a short ticket summary and gives it to the helpdesk ticket, after the reply", async () => {
    runAgentMock.mockResolvedValue({ answer: "Bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const outcome = await turn(row.id, "I need a custom report", { deferTicket: true });
    await outcome.pendingTicket;
    const [saved] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(saved.ticketSummary).toBe("Dana needs a custom report.");
    expect(vi.mocked(recordHandoffInJira).mock.calls.at(-1)?.[0].conversation.ticketSummary).toBe("Dana needs a custom report.");
  });

  it("does not make the customer wait for a summary when the ticket is raised inline", async () => {
    vi.mocked(summarizeForHandoff).mockClear();
    runAgentMock.mockResolvedValue({ answer: "Bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await turn(row.id, "I need a custom report");
    expect(summarizeForHandoff).not.toHaveBeenCalled();
  });
});

describe("promisesPersonFollowUp", () => {
  it.each([
    "Thanks, Casey. I’ll pass this to the team for review: - Issue: charged twice. A teammate will follow up by email.",
    "A teammate will follow up by email.",
    "Here's what I've passed to the support team: - Product: EAPx Cloud",
    "I have passed your request to the EAP Expert Support Team.",
    "Someone from the team will be in touch tomorrow.",
    "I'll hand this over to the support team now.",
  ])("recognises %s", (text) => expect(promisesPersonFollowUp(text)).toBe(true));

  it.each([
    "Go to the EAPx Cloud sign-in page and click Forgot password.",
    "Which product are you trying to access: EAPx Cloud or something else?",
    "Please provide your work email, full name, and organization so a teammate can follow up.",
    "That's outside what I can help with here.",
    "If you'd like, I can raise a ticket for the rest.",
    "A teammate can help with both requests. Please share your work email.",
    "",
  ])("leaves %s alone", (text) => expect(promisesPersonFollowUp(text)).toBe(false));
});
