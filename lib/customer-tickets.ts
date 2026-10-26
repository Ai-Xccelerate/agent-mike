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
  /** A number the customer quoted that is theirs (checked email) and has a helpdesk key: a chase can go on it. */
  chaseable?: boolean;
  /** The request being handled in this very conversation: not an earlier one. */
  thisChat?: boolean;
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
  const asked = quotedReference ? quotedMatcher(ticketPrefix, quotedReference) : null;
  const own: CustomerTicket[] = rows.map((row) => ({
    reference: ticketReference(ticketPrefix, row.ticketNumber),
    serviceDeskKey: row.externalTicketKey ?? null,
    about: row.ticketSummary ?? row.subject ?? null,
    status: customerStatusWord(row.status),
    updated: row.updatedAt.toISOString(),
    ...(row.id === conversationId ? { thisChat: true } : {}),
    // An earlier request of this checked customer, quoted by its number: a chase can go on it.
    ...(email && asked && row.id !== conversationId && row.externalTicketKey && asked(row) ? { chaseable: true } : {}),
  }));
  // The address typed in this chat (not checked) can match a request's address; it is not proof, so it only ever earns a status.
  const typedEmail = current.customerEmail?.trim().toLowerCase() || null;
  const quoted = quotedReference ? await quotedTicket(organizationId, ticketPrefix, quotedReference, email ?? null, typedEmail) : null;
  if (quoted && !own.some((ticket) => ticket.reference === quoted.reference)) own.push(quoted);
  return own;
}

/** Whether a quoted number or helpdesk key names this conversation's request. */
function quotedMatcher(
  ticketPrefix: string | null | undefined,
  quoted: string,
): ((row: { ticketNumber: number; externalTicketKey: string | null }) => boolean) | null {
  const text = quoted.trim();
  const own = new RegExp(`^(?:${(ticketPrefix || "TCK").replace(/[^A-Za-z0-9]/g, "")}-)?(\\d{1,9})$`, "i").exec(text);
  const key = /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(text) ? text.toUpperCase() : null;
  if (!own && !key) return null;
  return (row) => (own ? row.ticketNumber === Number(own[1]) : false) || (key ? row.externalTicketKey?.toUpperCase() === key : false);
}

/**
 * A request the customer quotes by its number, from an earlier chat. Anyone could type a number, so a number alone
 * shows nothing. With the request's own address typed in this chat (not checked) only its status in plain words is
 * given; with a checked address that is the one on the request, what it is about as well.
 */
async function quotedTicket(
  organizationId: string,
  ticketPrefix: string | null | undefined,
  quoted: string,
  verifiedEmail: string | null,
  typedEmail: string | null,
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
  const rowEmail = row.customerEmail?.trim().toLowerCase() || null;
  // The same address, checked by a code (or the sender of an email): it is their own request, so say what it is about.
  const theirs = Boolean(verifiedEmail) && rowEmail === verifiedEmail;
  // A number alone proves nothing, and numbers are easy to guess: with neither a checked address nor the request's own
  // address typed in this chat, nothing at all is shown, not even that the request exists.
  if (!theirs && !(typedEmail && rowEmail === typedEmail)) return null;
  return {
    reference: ticketReference(ticketPrefix, row.ticketNumber),
    serviceDeskKey: row.externalTicketKey ?? null,
    about: theirs ? row.ticketSummary ?? row.subject ?? null : null,
    ...(theirs && row.externalTicketKey ? { chaseable: true } : {}),
    status: customerStatusWord(row.status),
    updated: row.updatedAt.toISOString(),
  };
}
