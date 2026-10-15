import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getOrganizationName } from "@/lib/bootstrap";
import { evaluateMessage } from "@/lib/guardrails";
import { retrieveKnowledge } from "@/lib/retrieval";
import { handoffToManager, runAgent, withoutEmDashes, type RunAgentResult } from "@/lib/agent";
import { maybeRefreshConversationSummary, REPLAY_MESSAGE_LIMIT, type HistoryTurn } from "@/lib/conversation-memory";
import { handoffTicketNotice, isHandoffTicket, recordHandoffInJira } from "@/lib/tools-integrations/atlassian";
import type { CustomerCard } from "@/lib/customer-cards";
import { notifyManager } from "@/lib/handoff-notify";
import { classifyConversation } from "@/lib/ticket-classifier";

/**
 * One customer-facing agent turn, shared by every channel (chat, widget,
 * email) so they all get the same guardrails, grounding, handoff and summary.
 * The caller has already stored the customer's message and checked that no
 * human has taken the conversation over.
 */

type Profile = Awaited<ReturnType<typeof import("@/lib/bootstrap").getOrCreateProfile>>;
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export function toHistoryTurns(rows: { senderType: string; senderName: string; body: string }[]): HistoryTurn[] {
  return rows.map((row) => ({ speaker: row.senderName, body: row.body }));
}

/** Per-org ticket numbers start at 1001. */
export async function nextTicketNumber(organizationId: string): Promise<number> {
  const result = await db.execute<{ next_ticket: number }>(
    sql`select coalesce(max(ticket_number), 1000) + 1 as next_ticket from conversations where organization_id = ${organizationId}`,
  );
  return Number(result.rows[0]?.next_ticket ?? 1001);
}

/**
 * Insert a new conversation with the org's next ticket number. Two
 * conversations started at the same moment (two website visitors, an email
 * arriving during a chat) read the same max(ticket_number), and the second
 * insert used to fail on conversations_org_ticket_unique with a 500. A taken
 * number is skipped and the next one tried instead.
 */
export async function insertConversationWithTicket(
  values: Omit<typeof conversations.$inferInsert, "ticketNumber">,
): Promise<typeof conversations.$inferSelect> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const ticketNumber = (await nextTicketNumber(values.organizationId)) + attempt;
    const [row] = await db
      .insert(conversations)
      .values({ ...values, ticketNumber })
      .onConflictDoNothing({ target: [conversations.organizationId, conversations.ticketNumber] })
      .returning();
    if (row) return row;
  }
  throw new Error("Couldn't allocate a ticket number for the new conversation");
}

/**
 * What the conversation already says about who the customer is: an email's
 * sender address and name. The website widget's placeholder name isn't one.
 */
function knownCustomerOf(conversation: { customerName: string; customerEmail: string | null }) {
  const name = conversation.customerName && conversation.customerName !== "Website visitor" ? conversation.customerName : null;
  return { name, email: conversation.customerEmail };
}

export interface CustomerTurn {
  reply: MessageRow;
  result: RunAgentResult;
  status: "open" | "needs_human";
  knowledgeSources: unknown[];
}

export async function runCustomerTurn(input: {
  organizationId: string;
  profile: Profile;
  conversation: ConversationRow;
  /** Messages before the one being answered, oldest first. */
  priorMessages: MessageRow[];
  userMessage: MessageRow;
  speakerName: string;
}): Promise<CustomerTurn> {
  const { organizationId, profile, conversation, priorMessages, userMessage, speakerName } = input;
  const message = userMessage.body;

  // The sender allowlist is the Guardrails page's own "Allowed email domains"
  // (empty = anyone may write in). Settings > Email domains is a different
  // list - where the worker may *send* email - and must never gate inbound
  // chat: widget visitors have no email on record, so using it here escalated
  // every chat message the moment any outbound domain was approved.
  const guardrail = evaluateMessage({
    message,
    senderEmail: conversation.customerEmail,
    escalationTerms: profile.escalationTerms,
    allowedDomains: profile.allowedDomains,
    requireUserVerification: profile.requireUserVerification,
  });

  // Local knowledge plus any enabled knowledge integration (e.g. Parchment).
  const { matches: knowledgeMatches, sources: knowledgeSources } = await retrieveKnowledge(profile, message);

  const recentHistory = toHistoryTurns(priorMessages.slice(-REPLAY_MESSAGE_LIMIT));

  let result: RunAgentResult;
  // Deterministic fast-fail (domain / literal phrases) stays here so we skip
  // retrieval+model when already escalating. Semantic intent + reply policy
  // run as SDK input/output guardrails inside runAgent.
  if (guardrail.escalate) {
    result = handoffToManager(profile);
  } else {
    try {
      result = await runAgent(
        profile,
        await getOrganizationName(organizationId),
        message,
        knowledgeMatches,
        organizationId,
        conversation.id,
        recentHistory,
        conversation.summary,
        speakerName,
        conversation.channel,
        knownCustomerOf(conversation),
      );
    } catch (error) {
      // Logged: the customer sees a polite handoff whatever went wrong, so without
      // this a provider outage or a turn limit looks like the worker choosing to hand over.
      console.warn("[agent] turn failed, handing over:", error instanceof Error ? `${error.name}: ${error.message}` : error);
      // A model/runtime failure (MaxTurnsExceededError, provider outage) must
      // not fail the channel. The customer message is already persisted;
      // degrade to the same handoff as a guardrail escalation. Tool side
      // effects from the failed run are left as-is — this product has no
      // transaction around tool calls, and rolling them back is out of scope.
      result = handoffToManager(profile);
    }
  }

  // Before the ticket is raised, so the reply quoted on it matches what the customer saw.
  result = { ...result, answer: withoutEmDashes(result.answer) };

  // A handoff raises (or updates) the helpdesk ticket here, in code, so it
  // can't be skipped or invented by the model. A Jira failure never blocks
  // the handoff itself: the customer still gets a person.
  // Cards for the chat panel (quick replies, the ticket). Email can't show
  // them, and its text already says everything.
  const showsCards = conversation.channel !== "email";
  const cards: CustomerCard[] = [];
  if (showsCards && result.choices?.length) {
    cards.push({ id: crypto.randomUUID(), kind: "choices", data: { options: result.choices.map(withoutEmDashes) } });
  }

  if (result.escalate) {
    const ticket = await recordHandoffInJira({
      organizationId,
      workerName: profile.displayName,
      conversation,
      transcript: toHistoryTurns([...priorMessages, userMessage]),
      latestMessage: message,
      workerReply: result.answer,
    }).catch((error: unknown) => {
      console.warn("[handoff] Jira ticket failed:", error instanceof Error ? error.message : error);
      return null;
    });
    // A refused ticket is recorded on the conversation for the manager; the
    // customer isn't told a number that doesn't exist.
    if (isHandoffTicket(ticket)) {
      result = { ...result, answer: `${result.answer}\n\n${handoffTicketNotice(ticket)}` };
      if (showsCards) {
        cards.push({
          id: crypto.randomUUID(),
          kind: "helpdesk_ticket",
          data: { key: ticket.key, title: ticket.title ?? null, requestType: ticket.requestType ?? null, created: ticket.created },
        });
      }
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
      cards,
    })
    .returning();

  // A conversation already waiting for a person stays that way when the
  // customer writes again ("thanks", more details). Only a person moves it on;
  // otherwise one polite reply would drop it out of the team's queue.
  const status = result.escalate || conversation.status === "needs_human" ? "needs_human" : "open";

  // Fold anything that just fell out of the replay window into the rolling
  // summary. Runs after the turn so it never delays the customer's answer.
  const allTurns = toHistoryTurns([...priorMessages, userMessage, reply]);
  const summaryState = await maybeRefreshConversationSummary(
    profile,
    { summary: conversation.summary, summarizedMessageCount: conversation.summarizedMessageCount },
    allTurns,
    "customer",
  );

  await db
    .update(conversations)
    .set({
      status,
      confidence: result.confidence,
      assignedTo: result.escalate ? profile.managerName : conversation.assignedTo,
      summary: summaryState.summary,
      summarizedMessageCount: summaryState.summarizedMessageCount,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  // Sort the ticket into the worker's request types, tiers and labels. It
  // runs after the answer is stored and is not awaited, so it never slows the
  // customer's reply; a failure just leaves the ticket unclassified.
  const handedOverNow = result.escalate && conversation.status !== "needs_human";
  void classifyConversation({ organizationId, profile, conversation, transcript: allTurns, handedOverNow }).catch((error: unknown) =>
    console.warn("[tickets] classification failed:", error instanceof Error ? error.message : error),
  );

  // A person is told the moment a conversation first needs them, whatever
  // the channel, not on every message while it waits. The email channel
  // sends its own (it also covers replies that couldn't be sent).
  if (result.escalate && conversation.status !== "needs_human" && conversation.channel !== "email") {
    const where = conversation.channel === "widget" ? "website chat" : "chat";
    await notifyManager(conversation, organizationId, `${profile.displayName} handed a ${where} conversation to you.`).catch(
      (error: unknown) => console.warn("[handoff] manager email failed:", error instanceof Error ? error.message : error),
    );
  }

  return { reply, result, status, knowledgeSources };
}
