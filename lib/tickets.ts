import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { INTERNAL_CONVERSATION_CHANNELS } from "@/lib/assistant-agent";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { resolveTicketSchema, type TicketSchema } from "@/lib/ticket-schema";

/**
 * The Tickets page's data. A ticket is a customer conversation: it already
 * has a number, a status, a handler and, when the worker handed it over, a
 * helpdesk key. Nothing here is stored twice. The helpdesk key is only a
 * link, so the queues work for customers with no helpdesk at all.
 *
 * Only real customer channels count; the Playground and the Assistant are the
 * manager's own testing.
 */

const MAX_TICKETS = 1000;
const SAMPLE_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(["resolved", "closed"]);

export type TicketHandler = "worker" | "human";

export type Ticket = {
  id: string;
  ticketNumber: number;
  subject: string | null;
  customerName: string;
  customerEmail: string | null;
  channel: string;
  status: string;
  /** Who has it now: the worker, or a person (handed over or taken over). */
  handler: TicketHandler;
  /** The worker's own classification, else the helpdesk's request type. */
  requestType: string | null;
  priority: string | null;
  tier: string | null;
  /** Stored labels plus the ones the state implies (handed-over, ticket-failed). */
  labels: string[];
  externalTicketKey: string | null;
  externalTicketError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueId = "all_open" | "needs_human" | "worker" | "human" | "closed";

export type TicketsPayload = {
  tickets: Ticket[];
  queues: Record<QueueId, number>;
  kpis: {
    open: number;
    needsHuman: number;
    /** Answered by the worker in the last 24 hours with no handover. */
    workerHandledToday: number;
    /** Handed over to the helpdesk in the last 24 hours. */
    raisedToday: number;
  };
  /** Ids the manager can spot-check: the worker's own answers from the last 24 hours. */
  sampleIds: string[];
  /** The connected helpdesk's request types (zeros included), then any others in use. */
  requestTypes: { name: string; count: number }[];
  helpdesk: { project: string } | null;
  /** The worker's own request types, tiers and labels (the defaults until it sets them). */
  schema: TicketSchema;
};

export function inQueue(ticket: Pick<Ticket, "status" | "handler">, queue: QueueId): boolean {
  const closed = CLOSED.has(ticket.status);
  switch (queue) {
    case "all_open":
      return !closed;
    case "needs_human":
      return ticket.status === "needs_human";
    case "worker":
      return ticket.status === "open" && ticket.handler === "worker";
    case "human":
      return !closed && ticket.handler === "human";
    case "closed":
      return closed;
  }
}

type Row = typeof conversations.$inferSelect;

export function toTicket(row: Row): Ticket {
  const handler: TicketHandler =
    row.status === "needs_human" || row.humanControlled || Boolean(row.externalTicketKey) ? "human" : "worker";
  // The status and handler columns already say "needs a person", so only what they don't say is implied.
  const implied: string[] = [];
  if (row.externalTicketKey) implied.push("handed-over");
  if (row.externalTicketError) implied.push("ticket-failed");
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    subject: row.subject,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    channel: row.channel,
    status: row.status,
    handler,
    requestType: row.requestType ?? row.externalTicketType,
    priority: row.externalTicketPriority ?? (row.priority !== "normal" ? row.priority : null),
    tier: row.tier,
    labels: [...new Set([...(row.labels ?? []), ...implied])],
    externalTicketKey: row.externalTicketKey,
    externalTicketError: row.externalTicketError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function computeTickets(input: { organizationId: string; now?: Date }): Promise<TicketsPayload> {
  const { organizationId } = input;
  const dayAgo = new Date((input.now ?? new Date()).getTime() - DAY_MS);

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
        eq(conversations.archived, false),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(MAX_TICKETS);

  const ids = rows.map((row) => row.id);
  const repliedRows = ids.length
    ? await db
        .selectDistinct({ conversationId: messages.conversationId })
        .from(messages)
        .where(and(inArray(messages.conversationId, ids), eq(messages.senderType, "agent")))
    : [];
  const replied = new Set(repliedRows.map((row) => row.conversationId));

  const tickets = rows.map(toTicket);
  const queueIds: QueueId[] = ["all_open", "needs_human", "worker", "human", "closed"];
  const queues = Object.fromEntries(
    queueIds.map((queue) => [queue, tickets.filter((ticket) => inQueue(ticket, queue)).length]),
  ) as Record<QueueId, number>;

  const handledByWorker = tickets.filter(
    (ticket, index) =>
      ticket.handler === "worker" && replied.has(ticket.id) && rows[index].updatedAt >= dayAgo,
  );

  // A helpdesk that can't be reached still leaves the counts we keep ourselves.
  const source = await helpdeskBreakdownSource(organizationId).catch(() => null);
  const schema = resolveTicketSchema((await getOrCreateProfile(organizationId)).ticketSchema);
  const counts = new Map<string, number>();
  for (const name of source?.types ?? schema.requestTypes) counts.set(name, 0);
  for (const ticket of tickets) {
    if (!CLOSED.has(ticket.status) && ticket.requestType) {
      counts.set(ticket.requestType, (counts.get(ticket.requestType) ?? 0) + 1);
    }
  }

  return {
    tickets,
    queues,
    kpis: {
      open: queues.all_open,
      needsHuman: queues.needs_human,
      workerHandledToday: handledByWorker.length,
      raisedToday: rows.filter((row) => row.externalTicketKey && row.createdAt >= dayAgo).length,
    },
    sampleIds: handledByWorker.slice(0, SAMPLE_LIMIT).map((ticket) => ticket.id),
    requestTypes: [...counts.entries()].map(([name, count]) => ({ name, count })),
    helpdesk: source ? { project: source.project } : null,
    schema,
  };
}
