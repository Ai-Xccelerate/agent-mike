import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { logAnsweredConversation, toHistoryTurns, verifiedCustomerOf, waitForConversationTicket, widgetNeedsIdentity } from "@/lib/customer-turn";
import { addInternalTicketNote, helpdeskRaisesTickets } from "@/lib/tools-integrations/atlassian";
import { IDLE_CLOSE_TEXT, IDLE_NUDGE_TEXT, readIdleCheckIn } from "@/lib/idle-check-in-settings";

/**
 * The website chat's idle check-in (Settings > Channels > Website chat). The widget keeps the clock, but only as a
 * reminder to ask: whether a stage is due is decided here, from the stored messages' own times, so a visitor's
 * browser can never make the worker speak early or twice.
 *
 * Stage "nudge": the worker's reply is the last message and has gone unanswered for nudgeAfterSeconds.
 * Stage "close": the nudge is the last message and has gone unanswered for closeAfterSeconds. The chat is resolved
 * and logged in Jira: a ticket marked answered when it has none, else a staff-only note on the one it has.
 */

export type IdleStage = "nudge" | "close";

type MessageRow = typeof messages.$inferSelect;
type ConversationRow = typeof conversations.$inferSelect;

export type IdleOutcome =
  | { due: false; status?: string; dueInSeconds?: number }
  | {
      due: true;
      message: MessageRow;
      status: string;
      /** Only on a close: the Jira ticket or note, in the background. Resolves when it is done; never rejects. */
      logged?: Promise<void>;
    };

/** The team owns these (needs_human), or they are already finished. */
const NEVER_STATUSES = new Set(["needs_human", "resolved", "closed"]);

function isNudge(message: MessageRow | undefined): boolean {
  return message?.senderType === "agent" && message.body === IDLE_NUDGE_TEXT;
}

/** null when the conversation is not this organization's (the caller answers 404). */
export async function runIdleCheckIn(input: {
  organizationId: string;
  conversationId: string;
  stage: IdleStage;
  now?: Date;
  /**
   * Server sweep only: the visitor left (closed the tab), so their browser never asked for the nudge. A close is then
   * due once the worker's last reply has gone unanswered for nudgeAfterSeconds + closeAfterSeconds.
   */
  visitorGone?: boolean;
}): Promise<IdleOutcome | null> {
  const { organizationId, conversationId, stage } = input;
  const now = input.now ?? new Date();
  const profile = await getOrCreateProfile(organizationId);
  const settings = readIdleCheckIn(profile.channelsConfig);

  // Locked for the decision and the write, so two calls at the same moment (two tabs, a retry) post once.
  const decided = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
      .limit(1)
      .for("update");
    if (!conversation) return null;
    // Off: quietly nothing, so a widget with a stale setting does no harm.
    if (!settings.enabled) return { outcome: { due: false } as IdleOutcome };

    const notDue = (dueInSeconds?: number) => ({
      outcome: { due: false, status: conversation.status, ...(dueInSeconds !== undefined ? { dueInSeconds } : {}) } as IdleOutcome,
    });
    if (conversation.channel !== "widget" || conversation.humanControlled || NEVER_STATUSES.has(conversation.status)) return notDue();

    const rows = await tx.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt));
    const last = rows.at(-1);
    // Only once the visitor has said something, and only while the worker spoke last.
    if (!last || last.senderType !== "agent" || !rows.some((row) => row.senderType === "customer")) return notDue();

    const waitFor = (seconds: number) => Math.ceil((last.createdAt.getTime() + seconds * 1000 - now.getTime()) / 1000);

    if (stage === "nudge") {
      // Already asked: the next step is the close, not a second nudge.
      if (isNudge(last)) return notDue();
      const wait = waitFor(settings.nudgeAfterSeconds);
      if (wait > 0) return notDue(wait);
      const [message] = await tx
        .insert(messages)
        .values({ conversationId: conversation.id, senderType: "agent", senderName: profile.displayName, body: IDLE_NUDGE_TEXT })
        .returning();
      await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversation.id));
      return { outcome: { due: true, message, status: conversation.status } as IdleOutcome };
    }

    // The close follows a nudge the visitor left unanswered, or (sweep) a reply left unanswered by a visitor who left.
    if (!isNudge(last) && !input.visitorGone) return notDue();
    const wait = waitFor(isNudge(last) ? settings.closeAfterSeconds : settings.nudgeAfterSeconds + settings.closeAfterSeconds);
    if (wait > 0) return notDue(wait);
    const [message] = await tx
      .insert(messages)
      .values({ conversationId: conversation.id, senderType: "agent", senderName: profile.displayName, body: IDLE_CLOSE_TEXT })
      .returning();
    await tx.update(conversations).set({ status: "resolved", updatedAt: now }).where(eq(conversations.id, conversation.id));
    return { outcome: { due: true, message, status: "resolved" } as IdleOutcome, closed: { conversation, transcript: rows } };
  });

  if (!decided) return null;
  if (!("closed" in decided) || !decided.closed || !decided.outcome.due) return decided.outcome;

  const logged = logClosedChat({
    organizationId,
    workerName: profile.displayName,
    identityMode: profile.identityMode,
    conversation: decided.closed.conversation,
    transcript: decided.closed.transcript,
  });
  return { ...decided.outcome, logged };
}

/**
 * Logs a chat closed after no reply. A conversation with a ticket gets a staff-only note on it; one without gets the
 * same "answered by the worker" ticket as "Ticket for every conversation", saying it was closed after no reply. No
 * ticket for a widget visitor who has not said who they are (the chat is closed, so there is no one left to ask).
 * Never throws.
 */
async function logClosedChat(input: {
  organizationId: string;
  workerName: string;
  identityMode: string | null;
  conversation: ConversationRow;
  transcript: MessageRow[];
}): Promise<void> {
  const { organizationId, workerName } = input;
  try {
    // A ticket for an earlier message may still be on its way: wait for it, then read what it recorded.
    await waitForConversationTicket(input.conversation.id);
    const [current] = await db.select().from(conversations).where(eq(conversations.id, input.conversation.id)).limit(1);
    const conversation = current ?? input.conversation;

    if (conversation.externalTicketKey) {
      await addInternalTicketNote(
        organizationId,
        conversation.externalTicketKey,
        `The customer went quiet in the website chat. ${workerName} asked if they still needed help, got no reply, and closed the chat.`,
      );
      return;
    }
    if (conversation.externalTicketError) return;
    if (widgetNeedsIdentity(conversation, input.identityMode)) return;
    if (!(await helpdeskRaisesTickets(organizationId))) return;

    const lastCustomer = [...input.transcript].reverse().find((row) => row.senderType === "customer");
    await logAnsweredConversation({
      organizationId,
      workerName,
      conversation,
      transcript: toHistoryTurns(input.transcript),
      latestMessage: lastCustomer?.body ?? "",
      workerReply: IDLE_CLOSE_TEXT,
      verifiedCustomer: verifiedCustomerOf(conversation),
      closedAfterNoReply: true,
    });
  } catch (error) {
    console.warn("[idle] logging the closed chat failed:", error instanceof Error ? error.message : error);
  }
}

/** Only chats the worker last spoke in within this long: switching the setting on never closes old, forgotten chats. */
const SWEEP_LOOKBACK_MINUTES = 60;
const SWEEP_EVERY_MS = 60_000;

/**
 * The server's half of the idle check-in. The widget asks for the nudge and the close while the visitor's page is
 * open; a visitor who closes the tab leaves nobody to ask, and the chat would stay open with nothing logged. So every
 * minute this closes the website chats, of workers with the setting on, that are due: a nudge left unanswered for
 * closeAfterSeconds, or a reply left unanswered for both delays (the visitor left before the nudge). runIdleCheckIn
 * decides each one under its row lock, so a sweep and a browser asking at the same moment close it once. Never throws.
 */
export async function sweepIdleChats(now: Date = new Date()): Promise<number> {
  try {
    const candidates = (
      await db.execute<{ id: string; organization_id: string }>(sql`
        select c.id, c.organization_id
        from conversations c
        join worker_profiles w on w.organization_id = c.organization_id
        join lateral (
          select m.sender_type, m.created_at from messages m where m.conversation_id = c.id order by m.created_at desc limit 1
        ) last on true
        where (w.channels_config -> 'idleCheckIn' ->> 'enabled') = 'true'
          and c.channel = 'widget'
          and c.human_controlled = false
          and c.status not in ('needs_human', 'resolved', 'closed')
          and last.sender_type = 'agent'
          and last.created_at > ${new Date(now.getTime() - SWEEP_LOOKBACK_MINUTES * 60_000)}
          and exists (select 1 from messages m2 where m2.conversation_id = c.id and m2.sender_type = 'customer')`)
    ).rows;
    let closed = 0;
    for (const row of candidates) {
      const outcome = await runIdleCheckIn({ organizationId: row.organization_id, conversationId: row.id, stage: "close", now, visitorGone: true }).catch(
        (error: unknown) => {
          console.warn("[idle] sweep could not check a chat:", error instanceof Error ? error.message : error);
          return null;
        },
      );
      if (outcome?.due) closed += 1;
    }
    if (closed > 0) console.info("[idle] sweep closed chats after no reply", JSON.stringify({ closed }));
    return closed;
  } catch (error) {
    console.warn("[idle] sweep failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}

let sweeper: ReturnType<typeof setInterval> | null = null;

/** Starts the minute sweep once per server (from the health check Railway makes on each deploy, and the chat route). */
export function startIdleSweep(): void {
  // Not in tests: a timer left running would hold the test process open.
  if (sweeper || process.env.VITEST || process.env.NODE_ENV === "test") return;
  sweeper = setInterval(() => void sweepIdleChats(), SWEEP_EVERY_MS);
  sweeper.unref?.();
}
