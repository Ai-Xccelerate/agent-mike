import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations, messages } from "@/db/schema";
import { handoffToManager, runAgent } from "@/lib/agent";
import { getOrCreateProfile, getOrganizationName, ensureOrganization } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { getMailboxByGrantId } from "@/lib/mailbox-repository";
import { getMessage, resolveNylasCredentials, sendMessage, type NylasMessage } from "@/lib/nylas";
import {
  bodyFromNylasMessage,
  isWorkerOutbound,
  senderFromNylasMessage,
  verifyNylasWebhook,
} from "@/lib/nylas-inbound";
import { retrieveKnowledge } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nylas webhook challenge handshake — must echo the raw challenge string. */
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (!challenge) {
    return NextResponse.json({ ok: true, service: "mike-nylas-webhook" });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function eventMessage(event: Record<string, unknown>): Partial<NylasMessage> | null {
  const data = event.data as Record<string, unknown> | undefined;
  const object = (data?.object || data?.message || event.message || event) as
    | Record<string, unknown>
    | undefined;
  return object && typeof object === "object" ? (object as Partial<NylasMessage>) : null;
}

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (!verifyNylasWebhook(raw, req.headers)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = String(event.type || event.trigger || "");
  if (type && type !== "message.created" && type !== "message.created.truncated") {
    return NextResponse.json({ accepted: true, ignored: `Unhandled event type: ${type}` });
  }

  const stub = eventMessage(event);
  const messageId = String(stub?.id || "").trim();
  const grantId = String(stub?.grant_id || "").trim();
  if (!messageId || !grantId) {
    return NextResponse.json({
      accepted: true,
      ignored: "Event did not contain a message id and grant_id",
    });
  }

  const mailbox = await getMailboxByGrantId(grantId);
  if (!mailbox || mailbox.status !== "connected") {
    return NextResponse.json({ accepted: true, ignored: "Unknown or inactive Nylas grant" });
  }
  await ensureOrganization(mailbox.organizationId, "Nylas inbox");

  const credentials = await resolveNylasCredentials(mailbox.organizationId);
  let message = stub as NylasMessage;
  if (credentials) {
    try {
      message = await getMessage(credentials.values, grantId, messageId);
    } catch (error) {
      console.warn("[nylas-webhook] message fetch failed; using event payload", error);
    }
  }

  if (isWorkerOutbound(message, mailbox.email)) {
    return NextResponse.json({ accepted: true, ignored: "Skipping worker outbound message" });
  }

  const body = bodyFromNylasMessage(message);
  const sender = senderFromNylasMessage(message);
  const threadId = String(message.thread_id || messageId);
  const subject = String(message.subject || "Email support request");
  if (!body) {
    return NextResponse.json({ accepted: true, ignored: "Inbound message body was empty" });
  }

  const orgId = mailbox.organizationId;
  const profile = await getOrCreateProfile(orgId);
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, orgId), eq(conversations.externalThreadId, threadId)))
    .limit(1);

  let conversation = existing;
  const history = conversation
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(messages.createdAt)
    : [];

  if (history.some((item) => item.metadata?.external_message_id === messageId)) {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      conversation_id: conversation?.id,
    });
  }

  if (!conversation) {
    const ticketResult = await db.execute<{ next_ticket: number }>(
      sql`select coalesce(max(ticket_number), 1000) + 1 as next_ticket from conversations where organization_id = ${orgId}`,
    );
    [conversation] = await db
      .insert(conversations)
      .values({
        organizationId: orgId,
        ticketNumber: Number(ticketResult.rows[0]?.next_ticket ?? 1001),
        channel: "email",
        customerName: sender.name,
        customerEmail: sender.email || null,
        subject,
        externalThreadId: threadId,
      })
      .returning();
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "customer",
    senderName: sender.label,
    body,
    metadata: { external_message_id: messageId },
  });

  const { matches: knowledge } = await retrieveKnowledge(profile, body);
  let result;
  try {
    result = await runAgent(
      profile,
      await getOrganizationName(orgId),
      body,
      knowledge,
      orgId,
      conversation.id,
      history.slice(-20).map((item) => ({ speaker: item.senderName, body: item.body })),
      conversation.summary,
      sender.name,
      "email",
    );
  } catch {
    result = handoffToManager(profile);
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "agent",
    senderName: profile.displayName,
    body: result.answer,
    citations: result.citations,
    metadata: { confidence: result.confidence, escalated: result.escalate },
  });

  const status = result.escalate ? "needs_human" : "open";
  await db
    .update(conversations)
    .set({
      status,
      assignedTo: result.escalate ? profile.managerName : conversation.assignedTo,
      confidence: result.confidence,
      summary: conversation.summary || body.slice(0, 240),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  let deliveryId: string | null = null;
  let deliveryError: string | null = null;
  if (profile.autoReply && credentials && sender.email) {
    try {
      const sent = await sendMessage(credentials.values, grantId, {
        to: [{ email: sender.email, ...(sender.name ? { name: sender.name } : {}) }],
        ...(result.escalate && profile.managerEmail
          ? { cc: [{ email: profile.managerEmail }] }
          : {}),
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        body: result.answer,
        replyToMessageId: messageId,
      });
      deliveryId = sent.id;
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json(
    {
      accepted: true,
      conversation_id: conversation.id,
      organization_id: orgId,
      escalated: result.escalate,
      delivery_id: deliveryId,
      delivery_error: deliveryError,
    },
    { status: 202 },
  );
}
