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

async function turn(conversationId: string, body: string, options: { channel?: string; deferTicket?: boolean } = {}) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Visitor", deferTicket: options.deferTicket });
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

describe("a handover straight after an answered message (AMS-T61)", () => {
  // Prod, 18 Nov: the answered chat's ticket was still being created when the next message arrived, the handover read the
  // conversation before the key was saved, and raised a second ticket: the customer was told SDS-22 while the chat held SDS-21.
  it("adds to the ticket the answered chat is still getting, and tells the customer that one's number", async () => {
    await setIdentity("off");
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: "Parallels login" });
    // The first call (the answered chat's ticket) takes a moment and only then saves its key, as the real one does.
    raise.mockImplementationOnce(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await db.update(conversations).set({ externalTicketKey: "SUP-21" }).where(eq(conversations.id, input.conversation.id));
      return { key: "SUP-21", created: true, title: "Unable to log in" };
    });
    raise.mockImplementationOnce(async (input) =>
      input.conversation.externalTicketKey ? { key: input.conversation.externalTicketKey, created: false } : { key: "SUP-22", created: true, title: "A second ticket" },
    );

    runAgentMock.mockResolvedValueOnce(answered);
    await turn(row.id, "I can't log in to Parallels");
    runAgentMock.mockResolvedValueOnce({ answer: "I've passed it to the team.", confidence: 0.3, escalate: true, citations: [] });
    const out = await turn(row.id, "No error, connection fails");

    expect(raise).toHaveBeenCalledTimes(2);
    expect(raise.mock.calls[1][0].conversation.externalTicketKey).toBe("SUP-21");
    expect(out.reply.body).toContain("SUP-21");
    expect(out.reply.body).not.toContain("SUP-22");
    const [saved] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(saved.externalTicketKey).toBe("SUP-21");
  });
});

describe("the first ticket finishes while the next message is being answered (AMS-T61, prod 18 Nov)", () => {
  // The answered chat's ticket was created and saved while the model was still writing the reply to the next message, so the
  // conversation read at the start of that turn had no key, and the handover raised a second ticket (SDS-24, then SDS-25).
  async function sequence(deferTicket: boolean) {
    await setIdentity("off");
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: "Parallels login" });
    raise.mockImplementationOnce(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await db.update(conversations).set({ externalTicketKey: "SUP-24" }).where(eq(conversations.id, input.conversation.id));
      return { key: "SUP-24", created: true, title: "Unable to log in" };
    });
    raise.mockImplementationOnce(async (input) =>
      input.conversation.externalTicketKey ? { key: input.conversation.externalTicketKey, created: false } : { key: "SUP-25", created: true, title: "A second ticket" },
    );
    runAgentMock.mockResolvedValueOnce(answered);
    await turn(row.id, "I can't log in to Parallels");
    // The second answer takes longer than the first ticket does.
    runAgentMock.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { answer: "I've passed it to the team.", confidence: 0.3, escalate: true, citations: [] };
    });
    const out = await turn(row.id, "No error, connection fails", { deferTicket });
    const followUp = await out.pendingTicket;
    return { row, out, followUp };
  }

  it("adds to the first ticket instead of raising another (plain endpoint)", async () => {
    const { row, out } = await sequence(false);
    expect(raise).toHaveBeenCalledTimes(2);
    expect(raise.mock.calls[1][0].conversation.externalTicketKey).toBe("SUP-24");
    expect(out.reply.body).toContain("SUP-24");
    expect(out.reply.body).not.toContain("SUP-25");
    const [saved] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(saved.externalTicketKey).toBe("SUP-24");
  });

  it("adds to the first ticket instead of raising another (website widget, ticket after the reply)", async () => {
    const { row, followUp } = await sequence(true);
    expect(raise).toHaveBeenCalledTimes(2);
    expect(raise.mock.calls[1][0].conversation.externalTicketKey).toBe("SUP-24");
    expect(followUp?.message.body).toContain("SUP-24");
    expect(followUp?.message.body).not.toContain("SUP-25");
    const [saved] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(saved.externalTicketKey).toBe("SUP-24");
  });
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
