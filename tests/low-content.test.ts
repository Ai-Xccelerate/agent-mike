import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";

const runAgentMock = vi.hoisted(() => vi.fn());
const retrieveMock = vi.hoisted(() => vi.fn(async () => ({ matches: [], sources: [] })));

vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: retrieveMock }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => null),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));

let orgId: string;

beforeEach(async () => {
  orgId = `org-lowcontent-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  runAgentMock.mockReset();
  retrieveMock.mockClear();
});

async function turn(body: string) {
  const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
  const [userMessage] = await db.insert(messages).values({ conversationId: row.id, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation: row, priorMessages: [], userMessage, speakerName: "Visitor" });
}

describe("a message with no words in it", () => {
  it.each(["???", "😡😡", "...", "  ?!  "])("asks what they need without running the model or a handoff: %s", async (text) => {
    const result = await turn(text);
    expect(runAgentMock).not.toHaveBeenCalled();
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(result.result.escalate).toBe(false);
    expect(result.status).toBe("open");
    expect(result.reply.body).toContain("What can I help you with?");
  });

  it("still answers a message that has a word or a number", async () => {
    runAgentMock.mockResolvedValue({ answer: "Which password?", confidence: 0.9, escalate: false, citations: [] });
    await turn("password");
    await turn("404");
    expect(runAgentMock).toHaveBeenCalledTimes(2);
  });
});
