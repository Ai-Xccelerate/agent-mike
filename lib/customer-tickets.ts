import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { trustedCustomerEmail } from "@/lib/customer-identity";
import { customerStatusWord, ticketReference } from "@/lib/ticket-reference";

const LIMIT = 10;

export type CustomerTicket = {
  reference: string;
  /** The helpdesk key, when one was raised. */
  serviceDeskKey: string | null;
  about: string | null;
  status: string;
  updated: string;
};

/**
 * The requests this customer has with the worker: the one they are chatting in, and others under the same email
 * only when that email can be relied on (the sender of an email, or a code was typed back). A visitor's typed
 * address never opens other people's requests.
 */
export async function customerTickets(
  organizationId: string,
  conversationId: string,
  ticketPrefix: string | null | undefined,
  quotedReference?: string,
): Promise<CustomerTicket[]> {
  const [current] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  if (!current) return [];
  const email = trustedCustomerEmail(current)?.trim().toLowerCase();
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        ne(conversations.channel, "assistant"),
        email
          ? or(eq(conversations.id, conversationId), sql`lower(${conversations.customerEmail}) = ${email}`)
          : eq(conversations.id, conversationId),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(LIMIT);
  const own = rows.map((row) => ({
    reference: ticketReference(ticketPrefix, row.ticketNumber),
    serviceDeskKey: row.externalTicketKey ?? null,
    about: row.ticketSummary ?? row.subject ?? null,
    status: customerStatusWord(row.status),
    updated: row.updatedAt.toISOString(),
  }));
  const quoted = quotedReference ? await quotedTicket(organizationId, ticketPrefix, quotedReference) : null;
  if (quoted && !own.some((ticket) => ticket.reference === quoted.reference)) own.push(quoted);
  return own;
}

/**
 * A request the customer quotes by its number, from an earlier chat. Anyone could type a number, so only its
 * status in plain words is given: what it was about stays with the customer to say, and the summary is not shown.
 */
async function quotedTicket(
  organizationId: string,
  ticketPrefix: string | null | undefined,
  quoted: string,
): Promise<CustomerTicket | null> {
  const text = quoted.trim();
  const own = new RegExp(`^(?:${(ticketPrefix || "TCK").replace(/[^A-Za-z0-9]/g, "")}-)?(\\d{1,9})$`, "i").exec(text);
  const number = own;
  const byKey = /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(text) ? text.toUpperCase() : null;
  const conditions = [byKey ? sql`upper(${conversations.externalTicketKey}) = ${byKey}` : null, number ? eq(conversations.ticketNumber, Number(number[1])) : null].filter(
    (condition): condition is NonNullable<typeof condition> => condition !== null,
  );
  if (conditions.length === 0) return null;
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), ne(conversations.channel, "assistant"), or(...conditions)))
    .limit(1);
  if (!row) return null;
  return {
    reference: ticketReference(ticketPrefix, row.ticketNumber),
    serviceDeskKey: row.externalTicketKey ?? null,
    about: null,
    status: customerStatusWord(row.status),
    updated: row.updatedAt.toISOString(),
  };
}
