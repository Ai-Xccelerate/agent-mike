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
  return rows.map((row) => ({
    reference: ticketReference(ticketPrefix, row.ticketNumber),
    serviceDeskKey: row.externalTicketKey ?? null,
    about: row.ticketSummary ?? row.subject ?? null,
    status: customerStatusWord(row.status),
    updated: row.updatedAt.toISOString(),
  }));
}
