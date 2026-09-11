import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, emailDomains, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { evaluateMessage } from "@/lib/guardrails";
import { approvedDomains } from "@/lib/email-domains";
import { retrieveKnowledge } from "@/lib/retrieval";
import { runAgent } from "@/lib/agent";

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

  const result = guardrail.escalate
    ? {
        answer: `I want to make sure this is handled correctly, so I'm bringing in ${profile.managerName}. They'll review the conversation and follow up here.`,
        confidence: Math.min(0.4, profile.confidenceThreshold - 0.1),
        escalate: true,
        citations: [] as string[],
      }
    : await runAgent(profile, tenant.orgId, message, knowledgeMatches, tenant.orgId);

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
