import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { publicAppUrl } from "@/lib/env";
import { sendAsWorker } from "@/lib/outbound";

/**
 * The email a human gets when the worker hands a conversation over, on any
 * channel. It goes to the address under Settings > Human manager and is sent
 * from the worker's own connected mailbox: it's an internal alert, so the
 * customer never sees it. No manager email, or no mailbox, means no email;
 * the conversation still waits in the Inbox.
 */

type ConversationRow = typeof conversations.$inferSelect;

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
    // Where the customer will see a reply depends on how they reached the worker.
    (() => {
      const where =
        conversation.channel === "email" ? "in the same email thread" : "in the chat, if they still have it open";
      return appUrl
        ? `Open ${ticket} in the Inbox: ${appUrl}/inbox?conversation=${conversation.id}\nReply there and the customer gets your answer ${where}. ${workerName} stops replying once you do.`
        : `Open ${ticket} in the Inbox to reply. The customer gets your answer ${where}.`;
    })(),
  ].filter(Boolean);

  return {
    subject: `Needs you: ${ticket} ${conversation.subject || (conversation.channel === "email" ? "email from a customer" : "chat with a customer")}`,
    body: sections.join("\n\n"),
  };
}

export async function notifyManager(
  conversation: ConversationRow,
  organizationId: string,
  reason: string,
  /** A handoff follows the manager's on/off switch; a problem (a reply that couldn't be sent) always goes out. */
  kind: "handoff" | "problem" = "handoff",
) {
  const profile = await getOrCreateProfile(organizationId);
  if (kind === "handoff" && !profile.emailManagerOnHandoff) {
    console.info(`[handoff] handoff emails are off, so nobody was emailed about conversation ${conversation.id}`);
    return;
  }
  if (!profile.managerEmail) {
    console.info(`[handoff] no manager email set, so nobody was notified about conversation ${conversation.id}`);
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
    console.info(`[handoff] email sent to the manager for conversation ${conversation.id}`);
  } catch (error) {
    console.warn("[handoff] manager email failed", error);
  }
}

