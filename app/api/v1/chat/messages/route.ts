import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { resolveChatTenant } from "@/lib/chat-turn";
import { withNormalizedCitations } from "@/lib/citations";

// Reads the DB per request, never prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * What the website chat shows for its conversation, straight from the server: the history after a reload, and a
 * manager's replies, which no chat turn carries back to the visitor. Public like the rest of the widget API, so it is
 * scoped to the site token's organization and to widget conversations, and it returns only what a visitor already sees
 * in the chat (never attachments, panels or other internal fields).
 */
export async function GET(req: NextRequest) {
  const tenant = await resolveChatTenant(req);
  if (!tenant) return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversation_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, tenant.orgId), eq(conversations.channel, "widget")))
    .limit(1);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt);
  return NextResponse.json({
    conversation_id: conversation.id,
    status: conversation.status,
    human_controlled: conversation.humanControlled,
    messages: rows.map((row) => {
      const message = withNormalizedCitations(row);
      return {
        id: message.id,
        conversationId: message.conversationId,
        senderType: message.senderType,
        senderName: message.senderName,
        body: message.body,
        citations: message.citations,
        cards: message.cards,
        createdAt: message.createdAt,
      };
    }),
  });
}
