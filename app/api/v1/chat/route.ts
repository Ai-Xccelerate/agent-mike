import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { nextTicketNumber, runCustomerTurn } from "@/lib/customer-turn";

/** Roughly 2,500 words — a long email thread, not a pasted document. */
const MAX_MESSAGE_LENGTH = 10000;

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const identity = getIdentityAdapter();
  const isWidget = Boolean(req.headers.get("x-worker-site-token"));
  const tenant = isWidget
    ? await identity.resolveWidgetRequest(req)
    : await identity.resolveManagerRequest(req);

  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const message = body?.message as string | undefined;
  const conversationId = body?.conversation_id as string | undefined;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Bounded because the far end is a paid model with a context limit. Without
  // a cap, one request can burn an unbounded amount of money and a widget is
  // public by design — the limit belongs here, not in the client that anyone
  // can bypass. Generous enough for a pasted email thread.
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
    const nextTicket = await nextTicketNumber(tenant.orgId);

    [conversation] = await db
      .insert(conversations)
      .values({
        organizationId: tenant.orgId,
        ticketNumber: nextTicket,
        channel: tenant.source === "widget" ? "widget" : "chat",
        subject: message.slice(0, 120),
      })
      .returning();
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
    return NextResponse.json({
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

  return NextResponse.json({
    conversation_id: conversation.id,
    message: reply,
    status,
    confidence: result.confidence,
    escalated: result.escalate,
    knowledge_sources: knowledgeSources,
  });
}
