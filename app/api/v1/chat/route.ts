import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, emailDomains, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile, getOrganizationName } from "@/lib/bootstrap";
import { evaluateMessage } from "@/lib/guardrails";
import { approvedDomains } from "@/lib/email-domains";
import { retrieveKnowledge } from "@/lib/retrieval";
import { handoffToManager, runAgent } from "@/lib/agent";

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
    [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  }
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
        channel: tenant.source === "widget" ? "widget" : "chat",
        subject: message.slice(0, 120),
      })
      .returning();
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: tenant.source === "widget" ? "customer" : "manager",
    senderName: tenant.source === "widget" ? conversation.customerName : "Manager",
    body: message,
  });

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

  const domainRows = await db
    .select({ status: emailDomains.status, domain: emailDomains.domain })
    .from(emailDomains)
    .where(eq(emailDomains.organizationId, tenant.orgId));

  const guardrail = evaluateMessage({
    message,
    senderEmail: conversation.customerEmail,
    escalationTerms: profile.escalationTerms,
    allowedDomains: approvedDomains(domainRows),
    requireUserVerification: profile.requireUserVerification,
  });

  // Local knowledge plus any enabled knowledge integration (e.g. Parchment).
  const { matches: knowledgeMatches, sources: knowledgeSources } = await retrieveKnowledge(
    profile,
    message,
  );

  let result;
  if (guardrail.escalate) {
    result = handoffToManager(profile);
  } else {
    try {
      result = await runAgent(
        profile,
        await getOrganizationName(tenant.orgId),
        message,
        knowledgeMatches,
        tenant.orgId,
      );
    } catch {
      // A model/runtime failure (MaxTurnsExceededError, provider outage) must
      // not 500 the public widget. The customer message is already persisted
      // above; degrade to the same handoff as a guardrail escalation.
      // Tool side effects from the failed run are left as-is — this product
      // has no transaction around tool calls, and rolling them back is out of
      // scope for this catch.
      result = handoffToManager(profile);
    }
  }

  const [reply] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "agent",
      senderName: profile.displayName,
      body: result.answer,
      citations: result.citations,
    })
    .returning();

  const status = result.escalate ? "needs_human" : "open";
  await db
    .update(conversations)
    .set({
      status,
      confidence: result.confidence,
      assignedTo: result.escalate ? profile.managerName : conversation.assignedTo,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  return NextResponse.json({
    conversation_id: conversation.id,
    message: reply,
    status,
    confidence: result.confidence,
    escalated: result.escalate,
    knowledge_sources: knowledgeSources,
  });
}
