import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { inboundEmailText, replySubject } from "@/lib/email-text";
import { publicAppUrl } from "@/lib/env";
import { getMailboxByGrantId } from "@/lib/mailbox-repository";
import {
  getMessage,
  resolveNylasCredentials,
  toNylasMessage,
  verifyWebhookSignature,
} from "@/lib/nylas";
import {
  GMAIL_NEW_MESSAGE_TRIGGER,
  composioWebhookSecret,
  isAutomatedEmail,
  toGmailInbound,
} from "@/lib/composio-email";
import { getComposioClient } from "@/lib/tools-integrations/composio-client";
import { getConnectionByConnectedAccountId } from "@/lib/tools-integrations/connection-repository";
import { OutboundBlocked, sendAsWorker } from "@/lib/outbound";

/**
 * The email channel: an email to an org's connected mailbox becomes (or
 * continues) a conversation, the agent answers in the same thread, and a
 * human who takes over answers from the Inbox instead.
 *
 * Everything is scoped by the mailbox the email arrived at. A webhook carries
 * no session, so the mailbox is the only thing that says which organization
 * it belongs to: the Nylas grant id, or the Composio connected account for a
 * Gmail account connected under Settings > Integrations.
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
      /** The provider's id of the customer's email, which the reply threads under. */
      inboundMessageId: string;
    };

const MESSAGE_EVENTS = new Set(["message.created", "message.created.truncated"]);

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function customerNameFor(senderName: string, senderEmail: string): string {
  return senderName || senderEmail.split("@")[0] || senderEmail || "Email customer";
}

/** Mailbox names that say what an address is for, not who wrote from it. */
const ROLE_MAILBOXES = new Set([
  "admin", "billing", "contact", "customer", "hello", "help", "hi", "info", "mail", "noreply",
  "office", "sales", "service", "support", "team",
]);

/**
 * The first name to greet a customer by, or null when all we have is an
 * address. "Naik, Charan" and "Charan Naik" both give "Charan"; a bare
 * mailbox name only counts when it reads like a name, not like "support".
 */
export function greetingName(customerName: string | null | undefined): string | null {
  let name = (customerName || "").trim().replace(/^"(.*)"$/, "$1").trim();
  if (!name || name.includes("@") || name === "Email customer") return null;
  if (name.includes(",")) name = name.split(",").slice(1).join(" ").trim() || name;
  const first = name.split(/\s+/)[0].replace(/[^\p{L}'-]/gu, "");
  if (first.length < 2 || ROLE_MAILBOXES.has(first.toLowerCase())) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

const OPENS_WITH_GREETING = /^\s*(hi|hello|hey|dear|greetings|good (morning|afternoon|evening))\b/i;

/**
 * An email reply opens by name, the way a person answering a support inbox
 * would. Added here rather than left to the prompt so it is always there;
 * a reply that already greets is left as it is.
 */
export function withGreeting(body: string, customerName: string | null | undefined): string {
  if (OPENS_WITH_GREETING.test(body)) return body;
  const name = greetingName(customerName);
  return `${name ? `Hi ${name},` : "Hi there,"}\n\n${body.trimStart()}`;
}

/**
 * One inbound email, already verified and attributed to an organization, as
 * either provider delivers it.
 */
interface InboundEmail {
  organizationId: string;
  messageId: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  text: string;
}

/**
 * Opens or continues the thread's conversation and stores the customer's
 * message. The unique external message id turns a redelivery into a no-op.
 */
async function storeInboundEmail(email: InboundEmail): Promise<InboundOutcome> {
  const { organizationId, threadId } = email;
  let [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.externalThreadId, threadId)))
    .limit(1);

  if (!conversation) {
    conversation = await insertConversationWithTicket({
      organizationId,
      channel: "email",
      customerName: customerNameFor(email.senderName, email.senderEmail),
      customerEmail: email.senderEmail,
      subject: (email.subject || email.text).slice(0, 120),
      externalThreadId: threadId,
    });
  }

  try {
    const [stored] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderType: "customer",
        senderName: conversation.customerName,
        body: email.text,
        externalMessageId: email.messageId,
      })
      .returning();
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    return {
      kind: "stored",
      organizationId,
      conversationId: conversation.id,
      messageId: stored.id,
      inboundMessageId: email.messageId,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "duplicate", conversationId: conversation.id };
    throw error;
  }
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

  return storeInboundEmail({
    organizationId,
    messageId: message.id,
    threadId: message.threadId || message.id,
    senderEmail: sender,
    senderName: message.from[0]?.name ?? "",
    subject: message.subject,
    text,
  });
}

/**
 * Verifies and stores one Composio trigger delivery for a Gmail account
 * connected under Settings > Integrations. Same contract as the Nylas
 * receiver: fast, and the agent turn runs afterwards.
 */
export async function receiveComposioWebhook(request: Request): Promise<InboundOutcome> {
  const secret = composioWebhookSecret();
  if (!secret) return { kind: "rejected", reason: "COMPOSIO_WEBHOOK_SECRET is not set" };

  let event: Awaited<ReturnType<ReturnType<typeof getComposioClient>["triggers"]["parse"]>>;
  try {
    event = await getComposioClient().triggers.parse(request, { verifySecret: secret });
  } catch (error) {
    return {
      kind: "rejected",
      reason: `Signature or payload check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const { payload } = event;
  if (payload.triggerSlug !== GMAIL_NEW_MESSAGE_TRIGGER) {
    return { kind: "ignored", reason: `Not a new-Gmail-message trigger (${payload.triggerSlug || "none"})` };
  }

  // Which org this is for comes from the connected account alone, as with a
  // Nylas grant. An unknown account is acknowledged and dropped.
  const accountId = payload.metadata?.connectedAccount?.id ?? "";
  const connection = accountId ? await getConnectionByConnectedAccountId(accountId) : null;
  if (!connection || connection.integrationType !== "email" || connection.system !== "gmail") {
    return { kind: "ignored", reason: "Connected account is not any organization's Gmail" };
  }
  if (payload.userId && payload.userId !== connection.organizationId) {
    return { kind: "rejected", reason: "Delivery names a different organization than its connected account" };
  }
  if (connection.status !== "active") return { kind: "ignored", reason: "Gmail connection is not active" };
  const organizationId = connection.organizationId;

  const email = toGmailInbound(payload.payload);
  if (!email) return { kind: "ignored", reason: "No message id or sender" };

  const profile = await getOrCreateProfile(organizationId);
  const ownAddress = (profile.email || "").trim().toLowerCase();
  if (email.labelIds.includes("SENT") || email.labelIds.includes("DRAFT") || email.senderEmail === ownAddress) {
    return { kind: "ignored", reason: "The worker's own outgoing email" };
  }
  if (isAutomatedEmail(email)) return { kind: "ignored", reason: "Automated email (bounce, auto-reply or list mail)" };

  const text = inboundEmailText(email.body);
  if (!text) return { kind: "ignored", reason: "Email has no text" };

  return storeInboundEmail({
    organizationId,
    messageId: email.messageId,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderName: email.senderName,
    subject: email.subject,
    text,
  });
}

async function markNeedsHuman(conversationId: string, assignedTo: string) {
  await db
    .update(conversations)
    .set({ status: "needs_human", assignedTo, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

const BRIEF_TURNS = 6;
const BRIEF_TURN_CHARS = 240;
const BRIEF_MESSAGE_CHARS = 1500;

function clip(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/**
 * The handoff email a manager gets: enough to understand the ticket without
 * opening it, and a link straight to it. Plain text; outbound turns it into
 * HTML.
 */
export async function buildHandoffBrief(input: {
  conversation: ConversationRow;
  workerName: string;
  ticketPrefix: string;
  reason: string;
  appUrl: string | null;
}): Promise<{ subject: string; body: string }> {
  const { conversation, workerName, ticketPrefix, reason, appUrl } = input;
  const ticket = `${ticketPrefix}-${conversation.ticketNumber}`;
  const rows = await db
    .select({ senderType: messages.senderType, senderName: messages.senderName, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  const lastCustomer = [...rows].reverse().find((row) => row.senderType === "customer");
  const lastAgent = [...rows].reverse().find((row) => row.senderType === "agent");
  const earlier = rows.filter((row) => row !== lastCustomer && row !== lastAgent).slice(-BRIEF_TURNS);
  const who = (row: { senderType: string; senderName: string }) =>
    row.senderType === "customer" ? "Customer" : row.senderType === "agent" ? workerName : row.senderName;

  const sections = [
    `${reason}`,
    [
      `Ticket: ${ticket}`,
      `Customer: ${conversation.customerName}${conversation.customerEmail ? ` <${conversation.customerEmail}>` : ""}`,
      `Subject: ${conversation.subject || "(no subject)"}`,
      `Messages so far: ${rows.length}`,
      conversation.externalTicketKey ? `Jira ticket: ${conversation.externalTicketKey}` : "",
      conversation.externalTicketError ? `Jira ticket: not raised. ${conversation.externalTicketError}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    lastCustomer ? `What the customer wrote:\n${clip(lastCustomer.body, BRIEF_MESSAGE_CHARS)}` : "",
    lastAgent ? `What ${workerName} replied:\n${clip(lastAgent.body, BRIEF_MESSAGE_CHARS)}` : "",
    conversation.summary ? `Summary so far:\n${clip(conversation.summary, BRIEF_MESSAGE_CHARS)}` : "",
    earlier.length > 0
      ? `Earlier in the conversation:\n${earlier.map((row) => `${who(row)}: ${clip(row.body, BRIEF_TURN_CHARS)}`).join("\n")}`
      : "",
    appUrl
      ? `Open ${ticket} in the Inbox: ${appUrl}/inbox?conversation=${conversation.id}\nReply there and the customer gets your answer in the same email thread. ${workerName} stops replying once you do.`
      : `Open ${ticket} in the Inbox to reply. The customer gets your answer in the same email thread.`,
  ].filter(Boolean);

  return {
    subject: `Needs you: ${ticket} ${conversation.subject || "email from a customer"}`,
    body: sections.join("\n\n"),
  };
}

async function notifyManager(conversation: ConversationRow, organizationId: string, reason: string) {
  const profile = await getOrCreateProfile(organizationId);
  if (!profile.managerEmail) {
    console.info(`[email-channel] no manager email set, so nobody was notified about conversation ${conversation.id}`);
    return;
  }
  const [fresh] = await db.select().from(conversations).where(eq(conversations.id, conversation.id)).limit(1);
  const brief = await buildHandoffBrief({
    conversation: fresh ?? conversation,
    workerName: profile.displayName,
    ticketPrefix: profile.ticketPrefix,
    reason,
    appUrl: publicAppUrl(),
  });
  try {
    await sendAsWorker({
      orgId: organizationId,
      to: [{ email: profile.managerEmail, name: profile.managerName }],
      subject: brief.subject,
      body: brief.body,
    });
    console.info(`[email-channel] handoff email sent to the manager for conversation ${conversation.id}`);
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

  const replyBody = withGreeting(turn.reply.body, conversation.customerName);
  try {
    const sent = await sendAsWorker({
      orgId: organizationId,
      to: [{ email: conversation.customerEmail ?? "", name: conversation.customerName }],
      subject: replySubject(conversation.subject),
      body: replyBody,
      replyToMessageId: inboundMessageId,
      threadId: conversation.externalThreadId,
    });
    // The Inbox shows what the customer actually received, greeting included.
    await db
      .update(messages)
      .set({ externalMessageId: sent.id, body: replyBody })
      .where(eq(messages.id, turn.reply.id));
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
      threadId: conversation.externalThreadId,
    });
    return sent.id;
  } catch (error) {
    if (error instanceof OutboundBlocked) throw new EmailReplyError(error.message, 403);
    const message = error instanceof Error ? error.message : "The email could not be sent.";
    throw new EmailReplyError(message, 502);
  }
}
