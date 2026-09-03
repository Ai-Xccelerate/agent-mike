import { and, eq, max } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { db } from "@/lib/db";

export async function loadConversation(orgId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, orgId)))
    .limit(1);
  if (!conversation) return null;
  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  conversationMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { conversation, conversationMessages };
}

export async function nextTicketNumber(organizationId: string) {
  const [row] = await db
    .select({ value: max(conversations.ticketNumber) })
    .from(conversations)
    .where(eq(conversations.organizationId, organizationId));
  return (row?.value || 1000) + 1;
}
