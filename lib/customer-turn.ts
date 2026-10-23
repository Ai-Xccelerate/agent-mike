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
import { classifyConversation, summarizeForHandoff } from "@/lib/ticket-classifier";
import { timed } from "@/lib/timing";
import { citedTitles, groundedTitles, looksUngrounded } from "@/lib/citations";
import { referenceCard, referenceNotice, ticketReference } from "@/lib/ticket-reference";
import { isPlaceholderCustomerName } from "@/lib/customer-name";
import { normalizeIdentityMode, trustedCustomerEmail } from "@/lib/customer-identity";

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
function knownCustomerOf(
  conversation: { customerName: string; customerEmail: string | null; customerEmailVerifiedAt?: Date | null; channel: string },
  identityMode: string | null | undefined,
) {
  const name = isPlaceholderCustomerName(conversation.customerName) ? null : conversation.customerName;
  const mode = normalizeIdentityMode(identityMode);
  // Email conversations know their sender already; only chat and the widget ask who someone is.
  const asks = mode !== "off" && conversation.channel !== "email";
  return {
    name,
    email: conversation.customerEmail,
    ...(asks ? { identity: { mode, verified: Boolean(conversation.customerEmailVerifiedAt) } } : {}),
  };
}

/** The ticket's number, as its own message after the reply (see `deferTicket`). */
export interface TicketFollowUp {
  message: MessageRow;
}

export interface CustomerTurn {
  reply: MessageRow;
  result: RunAgentResult;
  status: "open" | "needs_human";
  knowledgeSources: unknown[];
  /**
   * Only with `deferTicket`, on a handoff: resolves once the helpdesk ticket
   * has been raised and its number stored as a second message, or to null when
   * there is nothing to tell the customer (no helpdesk, or Jira refused).
   */
  pendingTicket?: Promise<TicketFollowUp | null>;
}

/**
 * Handoffs being ticketed after their reply, per conversation. A customer who
 * writes again before the ticket exists must not raise a second one, so the
 * next turn waits for the first and then reads the ticket it recorded.
 */
const ticketsInFlight = new Map<string, Promise<unknown>>();

export async function runCustomerTurn(input: {
  organizationId: string;
  profile: Profile;
  conversation: ConversationRow;
  /** Messages before the one being answered, oldest first. */
  priorMessages: MessageRow[];
  userMessage: MessageRow;
  speakerName: string;
  /**
   * Store and return the reply without waiting for the helpdesk ticket on a
   * handoff (it took 4 to 12 seconds); the ticket's number follows as
   * `pendingTicket`. For the chat panel, which can show a second message. Email
   * and the JSON route keep it in the reply, so they leave this off.
   */
  deferTicket?: boolean;
  /** Told what the turn is really doing (chat panel progress); never states an outcome. */
  onStatus?: (stage: string, label: string) => void;
}): Promise<CustomerTurn> {
  const { organizationId, profile, conversation, priorMessages, userMessage, speakerName } = input;
  const progress = (stage: string, label: string) => {
    try {
      input.onStatus?.(stage, label);
    } catch {
      // Progress is a courtesy: it never fails the turn.
    }
  };
  const message = userMessage.body;

  // The sender allowlist is the Guardrails page's own "Allowed email domains"
  // (empty = anyone may write in). Settings > Email domains is a different
  // list - where the worker may *send* email - and must never gate inbound
  // chat: widget visitors have no email on record, so using it here escalated
  // every chat message the moment any outbound domain was approved.
  const guardrail = evaluateMessage({
    message,
    // A visitor's typed email must not pass the sender allow-list.
    senderEmail: trustedCustomerEmail(conversation),
    escalationTerms: profile.escalationTerms,
    allowedDomains: profile.allowedDomains,
    requireUserVerification: profile.requireUserVerification,
  });

  // Local knowledge plus any enabled knowledge integration (e.g. Parchment).
  progress("retrieval", "Checking our help articles…");
  const { matches: knowledgeMatches, sources: knowledgeSources } = await timed("retrieval", () => retrieveKnowledge(profile, message));

  const recentHistory = toHistoryTurns(priorMessages.slice(-REPLAY_MESSAGE_LIMIT));

  let result: RunAgentResult;
  // Deterministic fast-fail (domain / literal phrases) stays here so we skip
  // retrieval+model when already escalating. Semantic intent + reply policy
  // run as SDK input/output guardrails inside runAgent.
  if (guardrail.escalate) {
    result = handoffToManager(profile);
  } else {
    try {
      progress("reply", "Putting together a reply…");
      const organizationName = await timed("db.orgName", () => getOrganizationName(organizationId));
      result = await timed("agent.total", () =>
        runAgent(
        profile,
        organizationName,
        message,
        knowledgeMatches,
        organizationId,
        conversation.id,
        recentHistory,
        conversation.summary,
        speakerName,
        conversation.channel,
        knownCustomerOf(conversation, profile.identityMode),
        ),
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
  // The agent returns no citations of its own; record the retrieved articles the reply names.
  if (result.citations.length === 0) result = { ...result, citations: citedTitles(result.answer, knowledgeMatches) };
  // The reply did not name its source ("From: ..."): credit the page whose button and menu names it follows, if one clearly does.
  if (result.citations.length === 0 && !result.escalate) result = { ...result, citations: groundedTitles(result.answer, knowledgeMatches) };
  // Steps that match no page she was given: logged so it can be looked at (she may have read a page by tool).
  if (!result.escalate && looksUngrounded(result.answer, knowledgeMatches)) {
    console.warn("[agent] answer names buttons or fields found in none of the retrieved pages", { conversationId: conversation.id });
  }

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
  // The worker asked who this is. The card is only shown to someone who still has
  // something to give: details already on record (and, for codes, verified) need no form.
  const identityMode = normalizeIdentityMode(profile.identityMode);
  const verified = Boolean(conversation.customerEmailVerifiedAt);
  const identityKnown = Boolean(conversation.customerEmail) && !isPlaceholderCustomerName(conversation.customerName);
  if (showsCards && result.needIdentity && identityMode !== "off" && !(identityKnown && (identityMode === "email_match" || verified))) {
    cards.push({
      id: crypto.randomUUID(),
      kind: "identity_request",
      data: {
        mode: identityMode,
        ...(isPlaceholderCustomerName(conversation.customerName) ? {} : { name: conversation.customerName }),
        ...(conversation.customerEmail ? { email: conversation.customerEmail } : {}),
      },
    });
  }

  const raiseTicket = (fromConversation: ConversationRow) =>
    recordHandoffInJira({
      organizationId,
      workerName: profile.displayName,
      conversation: fromConversation,
      transcript: toHistoryTurns([...priorMessages, userMessage]),
      latestMessage: message,
      workerReply: result.answer,
      // Only an email a code was typed back for may be raised on behalf of.
      ...(verified && conversation.customerEmail
        ? { verifiedCustomer: { email: conversation.customerEmail, name: isPlaceholderCustomerName(conversation.customerName) ? null : conversation.customerName } }
        : {}),
    }).catch((error: unknown) => {
      console.warn("[handoff] Jira ticket failed:", error instanceof Error ? error.message : error);
      return null;
    });

  // Asking how a request is going is not a new handoff. On a conversation already with the team, a turn that only
  // looked up the customer's requests must not add a comment to the ticket each time the customer asks.
  if (result.escalate && result.checkedTickets && conversation.status === "needs_human") {
    result = { ...result, escalate: false };
  }

  // The ticket is raised after the reply is stored when the caller asked for that.
  const deferTicket = Boolean(input.deferTicket) && result.escalate && showsCards;
  // The first time this conversation is handed over; later turns add to the same request.
  const firstHandoff = result.escalate && conversation.status !== "needs_human";

  if (result.escalate && !deferTicket) {
    progress("ticket", "Logging this for the team…");
    const ticket = await timed("handoff.jira", () => raiseTicket(conversation));
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
    } else if (firstHandoff) {
      // No helpdesk ticket (none connected, switched off, or refused): the request still has its own
      // reference, so the customer always leaves with a number to quote and ask about.
      const reference = ticketReference(profile.ticketPrefix, conversation.ticketNumber);
      result = { ...result, answer: `${result.answer}\n\n${referenceNotice(reference)}` };
      if (showsCards) cards.push(referenceCard(reference));
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

  // Started as soon as the reply is stored, so the Jira call overlaps with the
  // rest of this turn's bookkeeping instead of following it.
  let pendingTicket: Promise<TicketFollowUp | null> | undefined;
  if (deferTicket) {
    const earlier = ticketsInFlight.get(conversation.id);
    pendingTicket = (async () => {
      const started = Date.now();
      await earlier?.catch(() => undefined);
      // What an earlier turn's ticket recorded after this turn read the conversation.
      const current = earlier
        ? (await db.select().from(conversations).where(eq(conversations.id, conversation.id)).limit(1))[0] ?? conversation
        : conversation;
      // The ticket gets a short summary of what it is about, not only the transcript.
      // Written here, after the reply is stored, so the customer never waits for it.
      const ticketSummary =
        conversation.status === "needs_human"
          ? current.ticketSummary
          : await summarizeForHandoff([
              ...toHistoryTurns([...priorMessages, userMessage]),
              { speaker: profile.displayName, body: result.answer },
            ]);
      if (ticketSummary && ticketSummary !== current.ticketSummary) {
        await db.update(conversations).set({ ticketSummary }).where(eq(conversations.id, conversation.id));
      }
      const ticket = await raiseTicket({ ...current, ticketSummary: ticketSummary ?? current.ticketSummary });
      console.info("[timing]", JSON.stringify({ turn: "handoff-ticket", channel: conversation.channel, ms: Date.now() - started }));
      if (!isHandoffTicket(ticket)) {
        if (!firstHandoff) return null;
        const reference = ticketReference(profile.ticketPrefix, conversation.ticketNumber);
        const [note] = await db
          .insert(messages)
          .values({
            conversationId: conversation.id,
            senderType: "agent",
            senderName: profile.displayName,
            body: referenceNotice(reference),
            cards: [referenceCard(reference)] satisfies CustomerCard[],
          })
          .returning();
        return { message: note };
      }
      const [message] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          senderType: "agent",
          senderName: profile.displayName,
          body: handoffTicketNotice(ticket),
          cards: [
            {
              id: crypto.randomUUID(),
              kind: "helpdesk_ticket",
              data: { key: ticket.key, title: ticket.title ?? null, requestType: ticket.requestType ?? null, created: ticket.created },
            },
          ] satisfies CustomerCard[],
        })
        .returning();
      return { message };
    })().catch((error: unknown) => {
      console.warn("[handoff] ticket follow-up failed:", error instanceof Error ? error.message : error);
      return null;
    });
    ticketsInFlight.set(conversation.id, pendingTicket);
    void pendingTicket.finally(() => {
      if (ticketsInFlight.get(conversation.id) === pendingTicket) ticketsInFlight.delete(conversation.id);
    });
  }

  // A conversation already waiting for a person stays that way when the
  // customer writes again ("thanks", more details). Only a person moves it on;
  // otherwise one polite reply would drop it out of the team's queue.
  const status = result.escalate || conversation.status === "needs_human" ? "needs_human" : "open";

  // Fold anything that just fell out of the replay window into the rolling
  // summary. Runs after the turn so it never delays the customer's answer.
  const allTurns = toHistoryTurns([...priorMessages, userMessage, reply]);
  const summaryState = await timed("summary.refresh", () =>
    maybeRefreshConversationSummary(
      profile,
      { summary: conversation.summary, summarizedMessageCount: conversation.summarizedMessageCount },
      allTurns,
      "customer",
    ),
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
    await timed("handoff.notify", () =>
      notifyManager(conversation, organizationId, `${profile.displayName} handed a ${where} conversation to you.`),
    ).catch(
      (error: unknown) => console.warn("[handoff] manager email failed:", error instanceof Error ? error.message : error),
    );
  }

  return { reply, result, status, knowledgeSources, ...(pendingTicket ? { pendingTicket } : {}) };
}
