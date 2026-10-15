import type { Conversation, Ticket, TicketQueueId, TicketSchema } from "@/lib/worker-api";

/** The queues down the Tickets page's left edge, in display order. */
export const TICKET_QUEUES: { id: TicketQueueId; label: string; hint: string }[] = [
  { id: "all_open", label: "All open", hint: "Everything not yet resolved or closed" },
  { id: "needs_human", label: "Needs a person", hint: "Waiting for someone to step in" },
  { id: "worker", label: "Handled by the worker", hint: "Open and answered without a person" },
  { id: "human", label: "With a person", hint: "Handed over or taken over" },
  { id: "closed", label: "Resolved and closed", hint: "Finished tickets" },
];

/**
 * What a worker sorts tickets with until it sets its own. Keep in step with
 * DEFAULT_TICKET_SCHEMA in the API's lib/ticket-schema.ts.
 */
export const DEFAULT_TICKET_SCHEMA: TicketSchema = {
  requestTypes: ["Question", "Problem", "Request", "Feedback", "Other"],
  tiers: ["Tier 1", "Tier 2", "Tier 3"],
  labels: ["urgent", "outage", "billing", "bug", "feature-request"],
};

export function resolveTicketSchema(stored: Partial<TicketSchema> | null | undefined): TicketSchema {
  return {
    requestTypes: stored?.requestTypes?.length ? stored.requestTypes : DEFAULT_TICKET_SCHEMA.requestTypes,
    tiers: stored?.tiers?.length ? stored.tiers : DEFAULT_TICKET_SCHEMA.tiers,
    labels: stored?.labels ?? DEFAULT_TICKET_SCHEMA.labels,
  };
}

export const STATUS_LABEL: Record<Conversation["status"], string> = {
  open: "Open",
  needs_human: "Needs a person",
  resolved: "Resolved",
  closed: "Closed",
};

export const CHANNEL_LABEL: Record<string, string> = {
  chat: "Chat",
  widget: "Chat widget",
  email: "Email",
};

export type TicketHandlerFilter = "all" | "worker" | "human";

export type TicketFilters = {
  queue: TicketQueueId;
  search: string;
  requestTypes: string[];
  handler: TicketHandlerFilter;
};

const CLOSED = new Set(["resolved", "closed"]);

export function inQueue(ticket: Pick<Ticket, "status" | "handler">, queue: TicketQueueId): boolean {
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

export function ticketRef(prefix: string | undefined, ticket: Pick<Ticket, "ticketNumber">): string {
  return `${prefix || "TCK"}-${ticket.ticketNumber}`;
}

/** What a row is called: the subject, else the customer. */
export function ticketTitle(ticket: Pick<Ticket, "subject" | "customerName">): string {
  return ticket.subject?.trim() || ticket.customerName;
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters, prefix?: string): Ticket[] {
  const query = filters.search.trim().toLowerCase();
  return tickets.filter((ticket) => {
    if (!inQueue(ticket, filters.queue)) return false;
    if (filters.handler !== "all" && ticket.handler !== filters.handler) return false;
    if (filters.requestTypes.length > 0 && !filters.requestTypes.includes(ticket.requestType ?? "")) return false;
    if (!query) return true;
    return [
      ticketRef(prefix, ticket),
      ticket.externalTicketKey ?? "",
      ticket.subject ?? "",
      ticket.customerName,
      ticket.customerEmail ?? "",
      ticket.requestType ?? "",
      ...ticket.labels,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

export function isPriorityUrgent(priority: string | null): boolean {
  return /^(critical|highest|urgent|high)$/i.test(priority ?? "");
}

export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The order the list was showing when a ticket was opened, so the page's up and down arrows can step through it. */
const ORDER_KEY = "aix.worker.ticketOrder";

export function saveTicketOrder(ids: string[], source: string): void {
  try {
    window.sessionStorage.setItem(ORDER_KEY, JSON.stringify({ ids, source }));
  } catch {
    // Private mode or storage full: the arrows just fall back to no neighbours.
  }
}

export function loadTicketOrder(): { ids: string[]; source: string } {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ORDER_KEY) ?? "null") as { ids?: unknown; source?: unknown } | null;
    if (parsed && Array.isArray(parsed.ids) && parsed.ids.every((id) => typeof id === "string")) {
      return { ids: parsed.ids as string[], source: typeof parsed.source === "string" ? parsed.source : "all_open" };
    }
  } catch {
    // Fall through to an empty order.
  }
  return { ids: [], source: "all_open" };
}
