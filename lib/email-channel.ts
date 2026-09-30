import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { nextTicketNumber, runCustomerTurn } from "@/lib/customer-turn";
import { inboundEmailText, replySubject } from "@/lib/email-text";
import { publicAppUrl } from "@/lib/env";
import { getMailboxByGrantId } from "@/lib/mailbox-repository";
import {
  getMessage,
  resolveNylasCredentials,
  toNylasMessage,
  verifyWebhookSignature,
  type NylasMessage,
} from "@/lib/nylas";
import { OutboundBlocked, sendAsWorker } from "@/lib/outbound";

/**
 * The email channel: an email to an org's connected mailbox becomes (or
 * continues) a conversation, the agent answers in the same thread, and a
 * human who takes over answers from the Inbox instead.
 *
 * Everything is scoped by the mailbox the email arrived at. A webhook carries
 * no session, so the Nylas grant id is the only thing that says which
 * organization it belongs to, and that organization's own Nylas application
 * (or the fleet's) is what verifies the delivery and fetches the message.
 */

type ConversationRow = typeof conversations.$inferSelect;

export type InboundOutcome =
  | { kind: "rejected"; reason: string }
  | { kind: "ignored"; reason: string }
  | { kind: "duplicate"; conversationId: string }
  | {
      kind: "stored";
      organizationId: string;
      conversationId: string;
      messageId: string;
      /** The Nylas id of the customer's email, which the reply threads under. */
      inboundMessageId: string;
    };

const MESSAGE_EVENTS = new Set(["message.created", "message.created.truncated"]);

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function customerNameFor(message: NylasMessage): string {
  const sender = message.from[0];
  if (!sender) return "Email customer";
  return sender.name || sender.email.split("@")[0] || sender.email;
}

/**
 * Verifies and stores one webhook delivery. Fast on purpose: Nylas retries a
 * delivery it doesn't get an answer to, so the agent turn runs afterwards
 * (processInboundEmail), and the unique external message id turns a retry
 * into a no-op.
 */
export async function receiveNylasWebhook(rawBody: string, signature: string | null): Promise<InboundOutcome> {
  let event: { type?: unknown; data?: { object?: unknown } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { kind: "rejected", reason: "Body is not JSON" };
  }

  const type = String(event.type ?? "");
  if (!MESSAGE_EVENTS.has(type)) return { kind: "ignored", reason: `Not a new-message event (${type || "none"})` };

  const stub = toNylasMessage(event.data?.object);
  if (!stub.id || !stub.grantId) return { kind: "ignored", reason: "No message or grant id" };

  // Which org this is for comes from the grant alone. An unknown grant is
  // acknowledged and dropped, so a stray webhook learns nothing.
  const mailbox = await getMailboxByGrantId(stub.grantId);
  if (!mailbox) return { kind: "ignored", reason: "Grant is not connected to any organization" };
  const organizationId = mailbox.organizationId;

  const credentials = await resolveNylasCredentials(organizationId);
  if (!credentials) return { kind: "rejected", reason: "No Nylas application is configured for this organization" };
  if (!verifyWebhookSignature(rawBody, signature, credentials.values.webhookSecret || "")) {
    return { kind: "rejected", reason: "Signature does not match this organization's webhook secret" };
  }

  // A truncated delivery, or one without a body, is fetched in full.
  let message = stub;
  if (type === "message.created.truncated" || !stub.body) {
    message = await getMessage(credentials.values, stub.grantId, stub.id);
  }

  const mailboxEmail = mailbox.email.trim().toLowerCase();
  const sender = message.from[0]?.email ?? "";
  if (!sender || sender === mailboxEmail || message.folders.some((folder) => folder.toUpperCase() === "SENT")) {
    return { kind: "ignored", reason: "The worker's own outgoing email" };
  }

  const text = inboundEmailText(message.body, message.snippet);
  if (!text) return { kind: "ignored", reason: "Email has no text" };

  const threadId = message.threadId || message.id;
  let [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.externalThreadId, threadId)))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversations)
      .values({
        organizationId,
        ticketNumber: await nextTicketNumber(organizationId),
        channel: "email",
        customerName: customerNameFor(message),
        customerEmail: sender,
        subject: (message.subject || text).slice(0, 120),
        externalThreadId: threadId,
      })
      .returning();
  }

  try {
    const [stored] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderType: "customer",
        senderName: conversation.customerName,
        body: text,
        externalMessageId: message.id,
      })
      .returning();
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    return {
      kind: "stored",
      organizationId,
      conversationId: conversation.id,
      messageId: stored.id,
      inboundMessageId: message.id,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "duplicate", conversationId: conversation.id };
    throw error;
  }
}

async function markNeedsHuman(conversationId: string, assignedTo: string) {
  await db
    .update(conversations)
    .set({ status: "needs_human", assignedTo, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

async function notifyManager(conversation: ConversationRow, organizationId: string, reason: string) {
  const profile = await getOrCreateProfile(organizationId);
  if (!profile.managerEmail) {
    console.info(`[email-channel] no manager email set, so nobody was notified about conversation ${conversation.id}`);
    return;
  }
  const link = publicAppUrl() ? `\n\nOpen it in the Inbox: ${publicAppUrl()}/inbox` : "";
  try {
    await sendAsWorker({
      orgId: organizationId,
      to: [{ email: profile.managerEmail, name: profile.managerName }],
      subject: `Needs you: ${conversation.subject || "email from a customer"}`,
      body: `${reason}\n\nFrom: ${conversation.customerName} <${conversation.customerEmail ?? "unknown"}>${link}`,
    });
  } catch (error) {
    console.warn("[email-channel] manager notification failed", error);
  }
}

/**
 * The agent's side of one stored inbound email: answer it in the thread, or
 * leave it for a human. Never throws to its caller (it runs after the webhook
 * has been answered); failures leave the conversation marked for a human.
 */
export async function processInboundEmail(stored: Extract<InboundOutcome, { kind: "stored" }>): Promise<void> {
  const { organizationId, conversationId, messageId, inboundMessageId } = stored;
  const profile = await getOrCreateProfile(organizationId);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  if (!conversation) return;

  // A human has taken over: the email is in the Inbox, and they answer it.
  if (conversation.humanControlled) return;

  if (!profile.channelsConfig?.email) {
    await markNeedsHuman(conversation.id, profile.managerName);
    return;
  }

  const [userMessage] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!userMessage) return;
  const priorMessages = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), lt(messages.createdAt, userMessage.createdAt)))
    .orderBy(asc(messages.createdAt));

  const turn = await runCustomerTurn({
    organizationId,
    profile,
    conversation,
    priorMessages,
    userMessage,
    speakerName: conversation.customerName,
  });

  // Automatic replies off: the answer is drafted in the Inbox for a human
  // to review and send, not emailed.
  if (!profile.autoReply) {
    await markNeedsHuman(conversation.id, profile.managerName);
    return;
  }

  try {
    const sent = await sendAsWorker({
      orgId: organizationId,
      to: [{ email: conversation.customerEmail ?? "", name: conversation.customerName }],
      subject: replySubject(conversation.subject),
      body: turn.reply.body,
      replyToMessageId: inboundMessageId,
    });
    await db.update(messages).set({ externalMessageId: sent.id }).where(eq(messages.id, turn.reply.id));
  } catch (error) {
    console.warn("[email-channel] reply was not sent", error);
    await markNeedsHuman(conversation.id, profile.managerName);
    await notifyManager(
      conversation,
      organizationId,
      `${profile.displayName} answered an email but the reply could not be sent: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  console.info(
    `[email-channel] replied on conversation ${conversation.id}; handoff: ${turn.result.escalate ? "yes" : "no"}`,
  );
  if (turn.result.escalate) {
    await notifyManager(conversation, organizationId, `${profile.displayName} handed an email conversation to you.`);
  }
}

export class EmailReplyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmailReplyError";
  }
}

/**
 * A manager's reply from the Inbox on an email conversation, sent to the
 * customer in the same thread. Returns the sent message's id. Throws
 * EmailReplyError with a status the route can pass on.
 */
export async function sendManagerEmailReply(conversation: ConversationRow, body: string): Promise<string> {
  if (!conversation.customerEmail) throw new EmailReplyError("This conversation has no customer email address.", 422);

  const [lastInbound] = await db
    .select({ externalMessageId: messages.externalMessageId })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.senderType, "customer"),
        isNotNull(messages.externalMessageId),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  try {
    const sent = await sendAsWorker({
      orgId: conversation.organizationId,
      to: [{ email: conversation.customerEmail, name: conversation.customerName }],
      subject: replySubject(conversation.subject),
      body,
      replyToMessageId: lastInbound?.externalMessageId ?? null,
    });
    return sent.id;
  } catch (error) {
    if (error instanceof OutboundBlocked) throw new EmailReplyError(error.message, 403);
    const message = error instanceof Error ? error.message : "The email could not be sent.";
    throw new EmailReplyError(message, 502);
  }
}
