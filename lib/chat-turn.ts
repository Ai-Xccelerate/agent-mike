import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";

/**
 * One chat turn for the Playground and the website widget, shared by the JSON
 * route (/api/v1/chat) and the AG-UI route (/api/v1/chat/agui) the chat
 * panel's CopilotKit client speaks, so both run exactly the same turn.
 */

/** Roughly 2,500 words — a long email thread, not a pasted document. */
const MAX_MESSAGE_LENGTH = 10000;

export type ChatOutcome = { status: number; json: Record<string, unknown> };

const fail = (status: number, json: Record<string, unknown>): ChatOutcome => ({ status, json });
const ok = (json: Record<string, unknown>): ChatOutcome => ({ status: 200, json });

export async function runChatRequest(req: NextRequest, body: Record<string, unknown> | null): Promise<ChatOutcome> {
  const identity = getIdentityAdapter();
  const isWidget = Boolean(req.headers.get("x-worker-site-token"));
  const tenant = isWidget
    ? await identity.resolveWidgetRequest(req)
    : await identity.resolveManagerRequest(req);

  if (!tenant) {
    return fail(401, { error: "Invalid or missing site token" });
  }

  const message = body?.message as string | undefined;
  const conversationId = body?.conversation_id as string | undefined;
  if (!message || typeof message !== "string") {
    return fail(400, { error: "message is required" });
  }

  // Bounded because the far end is a paid model with a context limit. Without
  // a cap, one request can burn an unbounded amount of money and a widget is
  // public by design — the limit belongs here, not in the client that anyone
  // can bypass. Generous enough for a pasted email thread.
  if (message.length > MAX_MESSAGE_LENGTH) {
    return fail(422, {
      error: "Message is too long",
      errors: {
        message: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters — this one is ${message.length.toLocaleString()}.`,
      },
    });
  }

  const profile = await getOrCreateProfile(tenant.orgId);

  let conversation;
  if (conversationId) {
    // Scoped to the caller's org: a widget token for one org must never read
    // or append to another org's conversation. A foreign id is treated the
    // same as an unknown one (a new conversation starts), so the response
    // doesn't reveal whether the id exists elsewhere.
    [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, tenant.orgId)))
      .limit(1);
  }

  // Load prior turns before inserting the current message so the latest user
  // line is not replayed twice (once in history, once as the current message).
  const priorMessages = conversation
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(messages.createdAt)
    : [];

  if (!conversation) {
    conversation = await insertConversationWithTicket({
      organizationId: tenant.orgId,
      channel: tenant.source === "widget" ? "widget" : "chat",
      subject: message.slice(0, 120),
    });
  }

  const speakerName = tenant.source === "widget" ? conversation.customerName : "Manager";
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: tenant.source === "widget" ? "customer" : "manager",
      senderName: speakerName,
      body: message,
    })
    .returning();

  // A manager has taken over — the agent stays quiet until it's handed back.
  if (conversation.humanControlled) {
    return ok( {
      conversation_id: conversation.id,
      message: null,
      status: conversation.status,
      confidence: conversation.confidence,
      escalated: false,
      knowledge_sources: [],
    });
  }

  const { reply, result, status, knowledgeSources } = await runCustomerTurn({
    organizationId: tenant.orgId,
    profile,
    conversation,
    priorMessages,
    userMessage,
    speakerName,
  });

  return ok( {
    conversation_id: conversation.id,
    message: reply,
    status,
    confidence: result.confidence,
    escalated: result.escalate,
    knowledge_sources: knowledgeSources,
  });
}
