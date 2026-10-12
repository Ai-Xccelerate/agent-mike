import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { sendAsWorker } from "@/lib/outbound";
import { notifyManager } from "@/lib/handoff-notify";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound")>()),
  sendAsWorker: vi.fn(async () => ({ id: "sent-1" })),
}));
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

const sendMock = vi.mocked(sendAsWorker);
const handoff = { answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] };

let orgId: string;

async function setManager(email: string | null, emailManagerOnHandoff = true) {
  await getOrCreateProfile(orgId);
  await db
    .update(workerProfiles)
    .set({ managerName: "EAP Expert Support Team", managerEmail: email, emailManagerOnHandoff })
    .where(eq(workerProfiles.organizationId, orgId));
}

async function turn(conversationId: string, body: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Website visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Website visitor" });
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Handoff email org");
  sendMock.mockClear();
  runAgentMock.mockReset();
});

describe("emailing a person when the worker hands over", () => {
  it("emails the human manager once when a website chat first needs a person, not on every message after", async () => {
    await setManager("support@eapexpert.example");
    runAgentMock.mockResolvedValue(handoff);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: "Nobody can log in" });

    await turn(conversation.id, "Nobody can log in");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent).toMatchObject({ orgId, to: [{ email: "support@eapexpert.example", name: "EAP Expert Support Team" }] });
    expect(sent.subject).toContain("Needs you:");
    expect(sent.body).toContain("handed a website chat conversation to you");
    expect(sent.body).toContain("in the chat, if they still have it open");

    await turn(conversation.id, "Any update?");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing without a manager email, and leaves the email channel to send its own", async () => {
    await setManager(null);
    runAgentMock.mockResolvedValue(handoff);
    const chat = await insertConversationWithTicket({ organizationId: orgId, channel: "chat" });
    await turn(chat.id, "Help");
    expect(sendMock).not.toHaveBeenCalled();

    await setManager("support@eapexpert.example");
    const email = await insertConversationWithTicket({ organizationId: orgId, channel: "email", customerEmail: "ana@example.com" });
    await turn(email.id, "Help");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the manager has turned handoff emails off", async () => {
    await setManager("support@eapexpert.example", false);
    runAgentMock.mockResolvedValue(handoff);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });

    await turn(conversation.id, "Nobody can log in");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("still emails about a problem, like a reply that couldn't be sent, with handoff emails off", async () => {
    await setManager("support@eapexpert.example", false);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "email" });

    await notifyManager(conversation, orgId, "Eva answered an email but the reply could not be sent: no mailbox", "problem");

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("never fails the customer's reply when the email can't go out", async () => {
    await setManager("support@eapexpert.example");
    runAgentMock.mockResolvedValue(handoff);
    sendMock.mockRejectedValueOnce(new Error("No mailbox is connected"));
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });

    const result = await turn(conversation.id, "Nobody can log in");
    expect(result.reply.body).toBe("I'm bringing in a teammate.");
    expect(result.status).toBe("needs_human");
  });
});
