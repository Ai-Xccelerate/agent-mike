import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  runAssistantAgent,
  maybeRefreshAssistantSummary,
  REPLAY_MESSAGE_LIMIT,
  type AssistantHistoryTurn,
} from "@/lib/assistant-agent";

/** Matches the customer-facing chat route's cap — same reasoning, same limit. */
const MAX_MESSAGE_LENGTH = 10000;

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The admin assistant's own chat endpoint — deliberately not the customer
 * chat route. That route simulates how the worker answers a customer
 * (guardrails, escalation, "I'm bringing in {manager}"); this one is the
 * manager asking their own assistant a question, answered by a distinct
 * agent (lib/assistant-agent.ts) with read-only tools over the org's data.
 * Conversations here use channel "assistant" so they never mix with real
 * customer traffic or Playground's "chat" test conversations.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const message = body?.message as string | undefined;
  const conversationId = body?.conversation_id as string | undefined;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: "Message is too long",
        errors: {
          message: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters — this one is ${message.length.toLocaleString()}.`,
        },
      },
      { status: 422 },
    );
  }

  const profile = await getOrCreateProfile(tenant.orgId);

  let conversation;
  if (conversationId) {
    [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
  }

  const priorMessages = conversation
    ? await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt)
    : [];

  if (!conversation) {
    const ticketResult = await db.execute<{ next_ticket: number }>(
      sql`select coalesce(max(ticket_number), 1000) + 1 as next_ticket from conversations where organization_id = ${tenant.orgId}`,
    );
    const nextTicket = Number(ticketResult.rows[0]?.next_ticket ?? 1001);

    [conversation] = await db
      .insert(conversations)
      .values({
        organizationId: tenant.orgId,
        ticketNumber: nextTicket,
        channel: "assistant",
        customerName: profile.managerName,
        subject: message.slice(0, 120),
      })
      .returning();
  }

  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "manager",
      senderName: profile.managerName,
      body: message,
    })
    .returning();

  // Only the most recent REPLAY_MESSAGE_LIMIT messages are replayed verbatim
  // - anything older is represented by conversation.summary instead, so a
  // long-running conversation doesn't grow the model input forever.
  const recentHistory: AssistantHistoryTurn[] = priorMessages.slice(-REPLAY_MESSAGE_LIMIT).map((m) => ({
    senderType: m.senderType === "agent" ? "agent" : "manager",
    senderName: m.senderName,
    body: m.body,
  }));

  let result;
  try {
    result = await runAssistantAgent(profile, tenant.orgId, conversation.id, message, recentHistory, conversation.summary);
  } catch (error) {
    // A raw agent-run failure (e.g. MaxTurnsExceededError from a longer
    // propose-then-confirm exchange) shouldn't surface as an unhandled 500 -
    // the manager's message is already persisted above either way.
    const detail = error instanceof Error ? error.message : "unknown error";
    result = {
      answer:
        "I ran into a problem completing that (" +
        detail +
        "). If you were confirming or cancelling a pending change, check whether it went through before trying again.",
    };
  }

  const [reply] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "agent",
      senderName: `${profile.displayName} Assistant`,
      body: result.answer,
    })
    .returning();

  // Maintenance pass: fold anything that just fell out of the replay window
  // into the rolling summary. Runs after the turn so it never delays the
  // manager's answer, and a failure here (see maybeRefreshAssistantSummary)
  // can't break the response that already went out.
  const allTurns: AssistantHistoryTurn[] = [...priorMessages, userMessage, reply].map((m) => ({
    senderType: m.senderType === "agent" ? "agent" : "manager",
    senderName: m.senderName,
    body: m.body,
  }));
  const summaryState = await maybeRefreshAssistantSummary(
    profile,
    { summary: conversation.summary, summarizedMessageCount: conversation.summarizedMessageCount },
    allTurns,
  );

  await db
    .update(conversations)
    .set({
      updatedAt: new Date(),
      summary: summaryState.summary,
      summarizedMessageCount: summaryState.summarizedMessageCount,
    })
    .where(eq(conversations.id, conversation.id));

  return NextResponse.json({
    conversation_id: conversation.id,
    message: reply,
  });
}
