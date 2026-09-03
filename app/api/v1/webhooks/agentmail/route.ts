import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations, messages } from "@/db/schema";
import { runAgent } from "@/lib/agent";
import { agentmailOrgId, replyToEmail, verifyWebhook } from "@/lib/agentmail";
import { nextTicketNumber } from "@/lib/conversations";
import { db } from "@/lib/db";
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

  const orgId = agentmailOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "AGENTMAIL_ORG_ID is not configured" }, { status: 500 });
  }
  await ensureOrganization(orgId, "AgentMail inbox");

  const messageData = (event.message ||
    (event.data as Record<string, unknown> | undefined)?.message ||
    event.data ||
    event) as Record<string, unknown>;

  const configuredInbox = (process.env.AGENTMAIL_INBOX_ID || "").trim().toLowerCase();
  if (configuredInbox) {
    const targetInbox = String(messageData.inbox_id || "").trim().toLowerCase();
    const recipients = messageData.to || [];
    const recipientText = (
      Array.isArray(recipients) ? recipients.join(" ") : String(recipients)
    ).toLowerCase();
    if (targetInbox !== configuredInbox && !recipientText.includes(configuredInbox)) {
      return NextResponse.json({
        accepted: true,
        ignored: `Not addressed to ${process.env.AGENTMAIL_INBOX_ID}`,
      });
    }
  }

  const messageId = String(messageData.message_id || messageData.id || "");
  const threadId = String(messageData.thread_id || messageId);
  const sender = String(messageData.from || "Unknown customer");
  const subject = String(messageData.subject || "Email support request");
  const body = cleanEmailText(
    String(messageData.extracted_text || messageData.text || messageData.preview || ""),
  );
  if (!messageId || !body) {
    return NextResponse.json({ accepted: true, ignored: "Event did not contain an inbound message" });
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
      deliveryId = await replyToEmail(messageId, answer.text, cc);
    } catch (err) {
      deliveryError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(
    {
      accepted: true,
      conversation_id: conversation.id,
      escalated: answer.escalated,
      delivery_id: deliveryId,
      delivery_error: deliveryError,
    },
    { status: 202 },
  );
}
