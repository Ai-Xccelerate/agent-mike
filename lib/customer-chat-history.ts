import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { normalizeIdentityMode } from "@/lib/customer-identity";
import { readRememberToken } from "@/lib/remembered-customer";

/**
 * A customer's own earlier website chats, for the history drawer in the widget.
 *
 * Only a customer whose email was checked with a code gets a list: the list is every widget chat in this
 * organization that was verified for the same address. A visitor who only typed an email gets nothing, because
 * anyone can type anyone's address. The proof is either the verified conversation the visitor is in right now, or
 * the signed token this device kept from an earlier verified visit.
 */

export const HISTORY_DAYS = 30;
export const HISTORY_LIMIT = 30;

export type CustomerChat = {
  id: string;
  title: string;
  /** The chat is finished (resolved or closed): the widget shows it read-only. */
  resolved: boolean;
  /** Waiting on the team: a handover happened and nobody has closed it. */
  waitingForTeam: boolean;
  ticketKey: string | null;
  lastMessageAt: string;
};

/** The verified address behind this request, or null when there is none (or the organization does not ask for a code). */
export async function verifiedEmailFor(input: { organizationId: string; conversationId?: unknown; rememberToken?: unknown }): Promise<string | null> {
  const profile = await getOrCreateProfile(input.organizationId);
  if (normalizeIdentityMode(profile.identityMode) !== "email_code") return null;

  if (typeof input.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(input.conversationId)) {
    const [row] = await db
      .select({ email: conversations.customerEmail, verifiedAt: conversations.customerEmailVerifiedAt })
      .from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId), eq(conversations.channel, "widget")))
      .limit(1);
    if (row?.email && row.verifiedAt) return row.email.trim().toLowerCase();
  }

  const remembered = readRememberToken(input.rememberToken, input.organizationId);
  return remembered ? remembered.email.trim().toLowerCase() : null;
}

/** The identity step opens a conversation before the customer has written anything, with this placeholder subject. */
const PLACEHOLDER_SUBJECT = /^new chat$/i;

function titleOf(subject: string | null, firstMessage: string | null): string {
  const flat = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
  const own = flat(subject);
  const text = own && !PLACEHOLDER_SUBJECT.test(own) ? own : flat(firstMessage);
  if (!text) return "Chat";
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}...` : text;
}

/** The customer's chats from the last 30 days that have at least one message from them, newest first. */
export async function listCustomerChats(organizationId: string, email: string): Promise<CustomerChat[]> {
  // Qualified by hand: in a one-table select, Drizzle writes a column inside a select-list expression without its table
  // name, and "id" would then mean the message's own id.
  const conversationId = sql`${sql.identifier("conversations")}.${sql.identifier("id")}`;
  const lastMessage = sql<Date>`(select max(m.created_at) from messages m where m.conversation_id = ${conversationId})`;
  const firstMessage = sql<string | null>`(select m.body from messages m where m.conversation_id = ${conversationId} and m.sender_type = 'customer' order by m.created_at asc limit 1)`;
  const rows = await db
    .select({
      id: conversations.id,
      subject: conversations.subject,
      status: conversations.status,
      ticketKey: conversations.externalTicketKey,
      first: firstMessage,
      last: lastMessage,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.channel, "widget"),
        eq(conversations.archived, false),
        sql`${conversations.customerEmailVerifiedAt} is not null`,
        sql`lower(${conversations.customerEmail}) = ${email}`,
        sql`exists (select 1 from messages m where m.conversation_id = ${conversations.id} and m.sender_type = 'customer')`,
        sql`${lastMessage} > now() - ${`${HISTORY_DAYS} days`}::interval`,
      ),
    )
    .orderBy(desc(lastMessage))
    .limit(HISTORY_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    title: titleOf(row.subject, row.first),
    resolved: row.status === "resolved" || row.status === "closed",
    waitingForTeam: row.status === "needs_human",
    ticketKey: row.ticketKey,
    lastMessageAt: new Date(row.last).toISOString(),
  }));
}
