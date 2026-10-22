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
/** Rows per page of the activity list, as on a Jira summary. */
export const RECENT_PAGE_SIZE = 10;
const TOP_SOURCES = 5;
const OPENING_CHARS = 140;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecentOutcome =
  | { kind: "answered"; source: string | null }
  | { kind: "ticket"; key: string; type: string | null }
  | { kind: "handed_over" }
  | { kind: "in_progress" };

/** Narrow the numbers to one channel, request type or priority. Unset means all. */
export type OverviewFilters = { channel?: string | null; requestType?: string | null; priority?: string | null };

/** What the status chart counts: the conversation's own status, in the order a manager reads it. */
export const OVERVIEW_STATUSES = ["open", "needs_human", "resolved", "closed"] as const;

export type OverviewBucket = { start: string; answered: number; handedOver: number };

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
  /** The activity list is paged: which page this is and how many conversations match in all. */
  recentPage: { page: number; pageSize: number; total: number };
  /** Conversations waiting for a person right now: any age, but narrowed by the same filters as everything else. */
  waitingNow: number;
  /** Answered vs handed over, one entry per hour (24h) or per day (7d, 30d), oldest first. Rolling windows ending now. */
  series: { bucket: "hour" | "day"; points: OverviewBucket[] };
  /** Conversation status in the period, every status listed (zeros included). */
  byStatus: { status: (typeof OVERVIEW_STATUSES)[number]; count: number }[];
  /** The articles and pages the worker cited most, counting each conversation once. */
  topSources: { title: string; count: number }[];
  /** What the filter menus offer. */
  filterOptions: { channels: string[]; requestTypes: string[]; priorities: string[] };
  filters: { channel: string | null; requestType: string | null; priority: string | null };
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
  filters?: OverviewFilters;
  /** Zero-based page of the activity list. */
  page?: number;
}): Promise<Overview> {
  const { organizationId, period } = input;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - OVERVIEW_PERIODS[period] * DAY_MS);
  const filters = {
    channel: input.filters?.channel?.trim() || null,
    requestType: input.filters?.requestType?.trim() || null,
    priority: input.filters?.priority?.trim() || null,
  };

  const everyRow = await db
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

  // Filters narrow every number on the page together, so the tiles and charts always agree.
  const rows = everyRow.filter(
    (row) =>
      (!filters.channel || row.channel === filters.channel) &&
      (!filters.requestType || row.externalTicketType === filters.requestType) &&
      (!filters.priority || row.externalTicketPriority === filters.priority),
  );

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

  const page = Math.max(0, Math.floor(input.page ?? 0));
  const recent = rows.slice(page * RECENT_PAGE_SIZE, (page + 1) * RECENT_PAGE_SIZE).map((row) => {
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

  // Rolling windows ending now: 24 hours of one hour each, or 7 / 30 days of one day each.
  const bucket = period === "24h" ? ("hour" as const) : ("day" as const);
  const stepMs = bucket === "hour" ? 60 * 60 * 1000 : DAY_MS;
  const bucketCount = Math.round((now.getTime() - since.getTime()) / stepMs);
  const points: OverviewBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    start: new Date(since.getTime() + index * stepMs).toISOString(),
    answered: 0,
    handedOver: 0,
  }));
  for (const row of rows) {
    const index = Math.min(bucketCount - 1, Math.floor((row.createdAt.getTime() - since.getTime()) / stepMs));
    if (index < 0) continue;
    if (handedOverRow(row)) points[index].handedOver += 1;
    else if (replied(row.id)) points[index].answered += 1;
  }

  const statusCounts = new Map<string, number>(OVERVIEW_STATUSES.map((status) => [status, 0]));
  for (const row of rows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const byStatus = OVERVIEW_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }));

  const citedIn = new Map<string, number>();
  for (const row of rows) {
    const titles = new Set<string>();
    for (const message of byConversation.get(row.id) ?? []) {
      if (message.senderType !== "agent") continue;
      for (const citation of message.citations ?? []) {
        const title = citationTitle(citation);
        if (title) titles.add(title);
      }
    }
    for (const title of titles) citedIn.set(title, (citedIn.get(title) ?? 0) + 1);
  }
  const topSources = [...citedIn.entries()]
    .map(([title, n]) => ({ title, count: n }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, TOP_SOURCES);

  // "Waiting now" is not a period: every open handoff counts, however old. The filters still apply, so the number
  // beside a filtered tile is about the same conversations.
  const waitingRows = await db
    .select({ channel: conversations.channel, type: conversations.externalTicketType, priority: conversations.externalTicketPriority })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
        eq(conversations.archived, false),
        eq(conversations.status, "needs_human"),
      ),
    );
  const waitingNow = waitingRows.filter(
    (row) =>
      (!filters.channel || row.channel === filters.channel) &&
      (!filters.requestType || row.type === filters.requestType) &&
      (!filters.priority || row.priority === filters.priority),
  ).length;

  const observed = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];
  // The desk's own list first, in its order; anything seen in the data that the desk didn't list (or couldn't be read for) after it.
  const merged = (listed: string[] | undefined, seen: (string | null)[]) => [...new Set([...(listed ?? []), ...observed(seen)])];
  const filterOptions = {
    channels: observed(everyRow.map((row) => row.channel)).sort(),
    requestTypes: merged(source?.types, everyRow.map((row) => row.externalTicketType)),
    priorities: merged(source?.priorities, everyRow.map((row) => row.externalTicketPriority)),
  };

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
    recentPage: { page, pageSize: RECENT_PAGE_SIZE, total: rows.length },
    waitingNow,
    series: { bucket, points },
    byStatus,
    topSources,
    filterOptions,
    filters,
  };
}
