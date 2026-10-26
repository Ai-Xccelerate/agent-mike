import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { sendAsWorker } from "@/lib/outbound";
import { recordHandoffInJira } from "@/lib/tools-integrations/atlassian";

const runAgentMock = vi.hoisted(() => vi.fn());
const everyOn = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/outbound", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/outbound")>()), sendAsWorker: vi.fn(async () => ({ id: "sent" })) }));
vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskTicketsEveryConversation: vi.fn(async () => everyOn.value),
  helpdeskRaisesTickets: vi.fn(async () => true),
  recordHandoffInJira: vi.fn(async () => ({ key: "SUP-21", created: true, title: "Add a provider" })),
  addInternalTicketNote: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_p: unknown, current: unknown) => current),
}));
vi.mock("@/lib/ticket-classifier", () => ({
  classifyConversation: vi.fn(async () => ({ done: false, reason: "not_needed" })),
  summarizeForHandoff: vi.fn(async () => "Asked how to add a provider."),
}));

const raise = vi.mocked(recordHandoffInJira);
let orgId: string;

async function setIdentity(mode: "off" | "email_match" | "email_code") {
  await getOrCreateProfile(orgId);
  await db.update(workerProfiles).set({ identityMode: mode, managerEmail: "team@eapexpert.example" }).where(eq(workerProfiles.organizationId, orgId));
}

async function turn(conversationId: string, body: string, options: { channel?: string } = {}) {
  void options;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Visitor" });
}
const answered = { answer: "Open Providers and choose New.", confidence: 0.9, escalate: false, citations: ["Add a New Provider"] };

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Every conversation org");
  everyOn.value = true;
  raise.mockClear();
  vi.mocked(sendAsWorker).mockClear();
  runAgentMock.mockReset();
});

describe("a ticket for every conversation", () => {
  it("logs a conversation the worker answered, as answered, with no manager email and nothing added to the reply", async () => {
    await setIdentity("off");
    runAgentMock.mockResolvedValue(answered);
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: "Add a provider" });
    const out = await turn(row.id, "How do I add a new provider?");
    await vi.waitFor(() => expect(raise).toHaveBeenCalledTimes(1));
    expect(raise.mock.calls[0][0]).toMatchObject({ answeredByWorker: true, latestMessage: "How do I add a new provider?" });
    expect(sendAsWorker).not.toHaveBeenCalled();
    expect(out.reply.body).toBe("Open Providers and choose New.");
    expect(out.status).toBe("open");
  });

  it("does not log a greeting or an out-of-scope first message, but does once there has been an exchange", async () => {
    await setIdentity("off");
    runAgentMock.mockResolvedValue({ ...answered, citations: [] });
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await turn(row.id, "hi");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(raise).not.toHaveBeenCalled();
    await turn(row.id, "I need help with providers");
    await vi.waitFor(() => expect(raise).toHaveBeenCalledTimes(1));
  });

  it("logs a conversation once, and a later handover adds to that ticket and emails the manager as usual", async () => {
    await setIdentity("off");
    runAgentMock.mockResolvedValue(answered);
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await turn(row.id, "How do I add a new provider?");
    await vi.waitFor(() => expect(raise).toHaveBeenCalledTimes(1));
    await db.update(conversations).set({ externalTicketKey: "SUP-21" }).where(eq(conversations.id, row.id));
    await turn(row.id, "Thanks, one more thing about providers");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(raise).toHaveBeenCalledTimes(1);

    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    await turn(row.id, "That did not work, I need a person");
    expect(sendAsWorker).toHaveBeenCalledTimes(1);
    expect(raise.mock.calls.at(-1)![0]).not.toHaveProperty("answeredByWorker");
  });

  it("asks a widget visitor for their details once, and logs the ticket once they are given", async () => {
    await setIdentity("email_code");
    runAgentMock.mockResolvedValue(answered);
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const first = await turn(row.id, "How do I add a new provider?");
    expect(first.reply.body).toContain("To log this request for the team I need your name and email.");
    expect((first.reply.cards as { kind: string }[]).some((card) => card.kind === "identity_request")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(raise).not.toHaveBeenCalled();

    const second = await turn(row.id, "Still thinking");
    expect(second.reply.body).not.toContain("I need your name and email");
    expect(raise).not.toHaveBeenCalled();

    await db.update(conversations).set({ customerName: "Ana", customerEmail: "ana@example.org", customerEmailVerifiedAt: new Date(), identitySource: "email_code" }).where(eq(conversations.id, row.id));
    await turn(row.id, "I've verified my email.");
    await vi.waitFor(() => expect(raise).toHaveBeenCalledTimes(1));
    expect(raise.mock.calls[0][0]).toMatchObject({ answeredByWorker: true, verifiedCustomer: { email: "ana@example.org" } });
  });

  it("does nothing when the setting is off", async () => {
    await setIdentity("off");
    everyOn.value = false;
    runAgentMock.mockResolvedValue(answered);
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await turn(row.id, "How do I add a new provider?");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(raise).not.toHaveBeenCalled();
  });
});
