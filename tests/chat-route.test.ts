import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST as postChat } from "@/app/api/v1/chat/route";
import { db } from "@/lib/db";
import { conversations, messages, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { handoffToManager } from "@/lib/agent";

const runAgentMock = vi.hoisted(() => vi.fn());
const retrieveKnowledgeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent")>();
  return { ...actual, runAgent: runAgentMock };
});

vi.mock("@/lib/retrieval", () => ({
  retrieveKnowledge: retrieveKnowledgeMock,
}));

const previousAdapter = getIdentityAdapter();
const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;

function adapterFor(orgId: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({
      orgId,
      userId: "test-manager",
      role: "owner",
      source: "test",
    }),
    resolveWidgetRequest: async () => null,
  };
}

function chatRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half" as const,
  });
}

async function readJson(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

describe("POST /api/v1/chat", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Chat route test");
    setIdentityAdapter(adapterFor(orgId));
    process.env.DEMO_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    retrieveKnowledgeMock.mockResolvedValue({ matches: [], sources: [] });
    runAgentMock.mockReset();
  });

  afterEach(async () => {
    setIdentityAdapter(previousAdapter);
    await db.delete(organizations).where(eq(organizations.id, orgId));
    if (previousDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemo;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  it("returns HTTP 200, persists the manager handoff, and marks needs_human when runAgent throws", async () => {
    runAgentMock.mockRejectedValue(new Error("MaxTurnsExceededError"));

    const res = await postChat(chatRequest({ message: "How do I invite a teammate?" }));
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(runAgentMock).toHaveBeenCalledOnce();
    expect(body.status).toBe("needs_human");
    expect(body.escalated).toBe(true);
    expect(body.confidence).toBe(0.4);
    const reply = body.message as { body: string; senderType: string };
    expect(reply.senderType).toBe("agent");
    expect(reply.body).toBe(
      "I want to make sure this is handled correctly, so I'm bringing in Manager. They'll review the conversation and follow up here.",
    );

    const conversationId = body.conversation_id as string;
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    expect(conversation.status).toBe("needs_human");
    expect(conversation.assignedTo).toBe("Manager");

    const stored = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    expect(stored.map((row) => row.senderType).sort()).toEqual(["agent", "manager"]);
    expect(stored.find((row) => row.senderType === "agent")?.body).toBe(reply.body);
  });

  it("leaves a successful turn unchanged: 200, open, original answer and citations", async () => {
    runAgentMock.mockResolvedValue({
      answer: "Invite them from Settings > Team.",
      confidence: 0.75,
      escalate: false,
      citations: ["Team invites"],
    });

    const res = await postChat(chatRequest({ message: "How do I invite a teammate?" }));
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(body.status).toBe("open");
    expect(body.escalated).toBe(false);
    expect(body.confidence).toBe(0.75);
    const reply = body.message as { body: string; citations: string[] };
    expect(reply.body).toBe("Invite them from Settings > Team.");
    expect(reply.citations).toEqual(["Team invites"]);

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, body.conversation_id as string))
      .limit(1);
    expect(conversation.status).toBe("open");
  });

  it("keeps guardrail escalation and does not call runAgent", async () => {
    const res = await postChat(chatRequest({ message: "I need a refund for my last charge" }));
    const { status, body } = await readJson(res);

    expect(status).toBe(200);
    expect(runAgentMock).not.toHaveBeenCalled();
    expect(body.status).toBe("needs_human");
    expect(body.escalated).toBe(true);
    expect(body.confidence).toBe(0.4);
    const reply = body.message as { body: string; citations: string[] };
    expect(reply.body).toBe(handoffToManager({ managerName: "Manager", confidenceThreshold: 0.72 }).answer);
    expect(reply.citations).toEqual([]);
  });
});
