import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, organizations } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";

const runAgentMock = vi.hoisted(() => vi.fn());
const retrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: retrieveMock }));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));

let orgId: string;

beforeEach(async () => {
  orgId = `cite-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  retrieveMock.mockReset();
  runAgentMock.mockReset();
});

afterEach(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

async function turn(body: string) {
  const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
  const [userMessage] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "customer", senderName: "Visitor", body }).returning();
  const [fresh] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
  const result = await runCustomerTurn({
    organizationId: orgId,
    profile: await getOrCreateProfile(orgId),
    conversation: fresh,
    priorMessages: [],
    userMessage,
    speakerName: "Visitor",
  });
  const [stored] = await db.select().from(messages).where(eq(messages.id, result.reply.id));
  return stored;
}

const knowledge = {
  matches: [
    { documentId: "d1", title: "Priority levels and what each means", heading: null, content: "…", rank: 1 },
    { documentId: "d2", title: "Screen sharing with the support team", heading: null, content: "…", rank: 0.5 },
  ],
  sources: [],
};

describe("citations on a stored reply", () => {
  it("record the retrieved article the reply names, and only that one", async () => {
    retrieveMock.mockResolvedValue(knowledge);
    runAgentMock.mockResolvedValue({ answer: "Critical means the system is down.\n\nFrom: Priority levels and what each means", confidence: 0.9, escalate: false, citations: [] });

    expect((await turn("What does Critical mean?")).citations).toEqual(["Priority levels and what each means"]);
  });

  it("are recorded from the From line, and the line is then left out of what the customer reads", async () => {
    retrieveMock.mockResolvedValue(knowledge);
    runAgentMock.mockResolvedValue({ answer: "Critical means the system is down.\n\nDid that help?\n\nFrom: Priority levels and what each means", confidence: 0.9, escalate: false, citations: [] });

    const stored = await turn("What does Critical mean?");
    expect(stored.citations).toEqual(["Priority levels and what each means"]);
    expect(stored.body).toBe("Critical means the system is down.\n\nDid that help?");
    expect(stored.body).not.toContain("From:");
  });

  it("stay empty when the reply names no article", async () => {
    retrieveMock.mockResolvedValue(knowledge);
    runAgentMock.mockResolvedValue({ answer: "Which product is this about?", confidence: 0.8, escalate: false, citations: [] });

    expect((await turn("Something is wrong")).citations).toEqual([]);
  });

  it("keep the agent's own citations when it gives some", async () => {
    retrieveMock.mockResolvedValue(knowledge);
    runAgentMock.mockResolvedValue({ answer: "Answer.", confidence: 0.9, escalate: false, citations: ["Its own source"] });

    expect((await turn("Question")).citations).toEqual(["Its own source"]);
  });
});
