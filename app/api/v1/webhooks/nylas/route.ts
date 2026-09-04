import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations, messages } from "@/db/schema";
import { runAgent } from "@/lib/agent";
import { nextTicketNumber } from "@/lib/conversations";
import { db } from "@/lib/db";
import {
  bodyFromMessage,
  fetchMessage,
  isMikeOutbound,
  replyToEmail,
  senderFromMessage,
  verifyWebhook,
  type NylasMessage,
} from "@/lib/nylas-mail";
import { mailboxByGrantId } from "@/lib/nylas-mailboxes";
import { getProfile } from "@/lib/profile";
import { applyOutcome } from "@/lib/serialize";
import { ensureOrganization } from "@/lib/tenant-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEmailText(text: string) {
  return text
    .replace(/\[image:[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

function extractMessageStub(event: Record<string, unknown>): Partial<NylasMessage> | null {
  const data = event.data as Record<string, unknown> | undefined;
  const object = (data?.object || data?.message || event.message || event) as
    | Record<string, unknown>
    | undefined;
  if (!object || typeof object !== "object") return null;
  return object as Partial<NylasMessage>;
}

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (!verifyWebhook(raw, req.headers)) {
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

  const stub = extractMessageStub(event);
  const stubId = String(stub?.id || "");
  if (!stubId) {
    return NextResponse.json({ accepted: true, ignored: "Event did not contain a message id" });
  }

  const grantId = String(stub?.grant_id || "").trim();
  if (!grantId) {
    return NextResponse.json({
      accepted: true,
      ignored: "Event did not contain a grant_id",
    });
  }

  const mailbox = await mailboxByGrantId(grantId);
  if (!mailbox) {
    return NextResponse.json({
      accepted: true,
      ignored: "Unknown Nylas grant — no org mapping",
    });
  }

  const orgId = mailbox.organizationId;
  await ensureOrganization(orgId, "Nylas inbox");

  let message: NylasMessage | null = null;
  try {
    message = await fetchMessage(mailbox.grantId, stubId);
  } catch (err) {
    console.warn("[nylas-webhook] fetchMessage failed; falling back to stub", err);
  }
  message = message || (stub as NylasMessage);

  if (isMikeOutbound(message, mailbox.email)) {
    return NextResponse.json({ accepted: true, ignored: "Skipping Mike outbound message" });
  }

  const messageId = String(message.id || stubId);
  const threadId = String(message.thread_id || messageId);
  const sender = senderFromMessage(message);
  const subject = String(message.subject || "Email support request");
  const body = cleanEmailText(bodyFromMessage(message));
  if (!messageId || !body) {
    return NextResponse.json({
      accepted: true,
      ignored: "Event did not contain an inbound message body",
    });
  }

  const profile = await getProfile(orgId);
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, orgId), eq(conversations.externalThreadId, threadId)))
    .limit(1);

  let conversation = existing;
  const history = conversation
    ? await db.select().from(messages).where(eq(messages.conversationId, conversation.id))
    : [];

  if (conversation && history.some((item) => item.metadata?.external_message_id === messageId)) {
    return NextResponse.json({
      accepted: true,
      duplicate: true,
      conversation_id: conversation.id,
    });
  }

  if (!conversation) {
    const [created] = await db
      .insert(conversations)
      .values({
        id: randomUUID(),
        organizationId: orgId,
        channel: "email",
        customerName: sender.split("<", 1)[0].trim().replace(/^"+|"+$/g, "") || sender,
        customerEmail: sender,
        subject,
        externalThreadId: threadId,
        ticketNumber: await nextTicketNumber(orgId),
      })
      .returning();
    conversation = created;
  }

  await db.insert(messages).values({
    id: randomUUID(),
    conversationId: conversation.id,
    senderType: "customer",
    senderName: sender,
    body,
    metadata: { external_message_id: messageId },
  });

  const answer = await runAgent(
    orgId,
    profile,
    body,
    history.map((item) => ({ senderType: item.senderType, body: item.body })),
  );

  await db.insert(messages).values({
    id: randomUUID(),
    conversationId: conversation.id,
    senderType: "agent",
    senderName: profile.displayName,
    body: answer.text,
    citations: answer.citations,
    metadata: { confidence: answer.confidence, reason: answer.reason },
  });

  const outcome = applyOutcome(conversation, profile, answer);
  await db
    .update(conversations)
    .set({
      ...outcome,
      confidence: answer.confidence,
      summary: body.slice(0, 240),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  let deliveryId: string | null = null;
  let deliveryError: string | null = null;
  if (profile.autoReply) {
    try {
      const cc = answer.escalated && profile.managerEmail ? [profile.managerEmail] : null;
      deliveryId = await replyToEmail(orgId, messageId, answer.text, {
        to: message.from?.[0]?.email,
        subject,
        cc,
      });
    } catch (err) {
      deliveryError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(
    {
      accepted: true,
      conversation_id: conversation.id,
      organization_id: orgId,
      escalated: answer.escalated,
      delivery_id: deliveryId,
      delivery_error: deliveryError,
    },
    { status: 202 },
  );
}
