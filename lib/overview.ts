import { and, asc, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { INTERNAL_CONVERSATION_CHANNELS } from "@/lib/assistant-agent";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";

/**
 * The Overview page's numbers for one worker: how much customer traffic it
 * had, how much it answered itself, what it handed over (by the connected
 * helpdesk's own request types and priorities), and what it did lately.
 * Only real customer channels count; the Playground and the Assistant are
 * the manager's own testing.
 */

export const OVERVIEW_PERIODS = { "24h": 1, "7d": 7, "30d": 30 } as const;
export type OverviewPeriod = keyof typeof OVERVIEW_PERIODS;

const MAX_CONVERSATIONS = 1000;
const RECENT_LIMIT = 8;
const OPENING_CHARS = 140;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecentOutcome =
  | { kind: "answered"; source: string | null }
  | { kind: "ticket"; key: string; type: string | null }
  | { kind: "handed_over" }
  | { kind: "in_progress" };

export type Overview = {
  period: OverviewPeriod;
  since: string;
  conversations: { total: number; byChannel: Record<string, number> };
  answeredByWorker: number;
  handedOver: number;
  tickets: {
    raised: number;
    /** The helpdesk the breakdowns come from, or null when none is connected. */
    helpdesk: { project: string } | null;
    /** Every request type the desk has (zeros included), in its own order, then any others seen. */
    byType: { name: string; count: number }[];
    /** Every priority the site has, in Jira's order, then any others seen. */
    byPriority: { name: string; count: number }[];
  };
  /** Without a helpdesk: what was handed over lately, by its subject. */
  handedOverTopics: string[];
  firstReply: { targetHours: number | null; measured: null };
  recent: { conversationId: string; at: string; channel: string; asked: string; outcome: RecentOutcome }[];
};

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** Counts, in the source's order first (zeros included), then anything else that turned up. */
function countIn(order: string[], values: (string | null)[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of order) counts.set(name, 0);
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function citationTitle(citation: unknown): string | null {
  if (typeof citation === "string") return citation;
  const title = (citation as { title?: unknown } | null)?.title;
  return typeof title === "string" ? title : null;
}

export async function computeOverview(input: {
  organizationId: string;
  period: OverviewPeriod;
  firstReplyTargetHours: number | null;
  now?: Date;
}): Promise<Overview> {
  const { organizationId, period } = input;
  const since = new Date((input.now ?? new Date()).getTime() - OVERVIEW_PERIODS[period] * DAY_MS);

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
        eq(conversations.archived, false),
        gte(conversations.createdAt, since),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(MAX_CONVERSATIONS);

  const ids = rows.map((row) => row.id);
  const allMessages = ids.length
    ? await db
        .select({
          conversationId: messages.conversationId,
          senderType: messages.senderType,
          body: messages.body,
          citations: messages.citations,
        })
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(asc(messages.createdAt))
    : [];
  const byConversation = new Map<string, typeof allMessages>();
  for (const message of allMessages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  const handedOverRow = (row: (typeof rows)[number]) =>
    row.status === "needs_human" || row.humanControlled || Boolean(row.externalTicketKey);
  const replied = (id: string) => (byConversation.get(id) ?? []).some((message) => message.senderType === "agent");

  const byChannel: Record<string, number> = {};
  for (const row of rows) byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
  const handedOver = rows.filter(handedOverRow);
  const answeredByWorker = rows.filter((row) => !handedOverRow(row) && replied(row.id)).length;

  const ticketRows = rows.filter((row) => row.externalTicketKey);
  // A helpdesk that can't be reached still leaves the counts we keep ourselves.
  const source = await helpdeskBreakdownSource(organizationId).catch(() => null);

  const recent = rows.slice(0, RECENT_LIMIT).map((row) => {
    const thread = byConversation.get(row.id) ?? [];
    const opening = thread.find((message) => message.senderType === "customer");
    const lastCited = [...thread].reverse().find((message) => message.senderType === "agent" && (message.citations ?? []).length > 0);
    const outcome: RecentOutcome = row.externalTicketKey
      ? { kind: "ticket", key: row.externalTicketKey, type: row.externalTicketType }
      : handedOverRow(row)
        ? { kind: "handed_over" }
        : replied(row.id)
          ? { kind: "answered", source: lastCited ? citationTitle(lastCited.citations[0]) : null }
          : { kind: "in_progress" };
    return {
      conversationId: row.id,
      at: row.createdAt.toISOString(),
      channel: row.channel,
      asked: clip(opening?.body ?? row.subject ?? "", OPENING_CHARS),
      outcome,
    };
  });

  return {
    period,
    since: since.toISOString(),
    conversations: { total: rows.length, byChannel },
    answeredByWorker,
    handedOver: handedOver.length,
    tickets: {
      raised: ticketRows.length,
      helpdesk: source ? { project: source.project } : null,
      byType: countIn(source?.types ?? [], ticketRows.map((row) => row.externalTicketType)),
      byPriority: countIn(source?.priorities ?? [], ticketRows.map((row) => row.externalTicketPriority)),
    },
    handedOverTopics: source ? [] : handedOver.slice(0, 5).map((row) => clip(row.subject ?? "", 80)).filter(Boolean),
    firstReply: { targetHours: input.firstReplyTargetHours, measured: null },
    recent,
  };
}
