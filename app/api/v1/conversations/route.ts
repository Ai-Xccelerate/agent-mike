import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations, messages } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { serializeConversation } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const status = req.nextUrl.searchParams.get("conversation_status");
    const channel = req.nextUrl.searchParams.get("channel");
    const filters = [eq(conversations.organizationId, tenant.orgId)];
    if (status) filters.push(eq(conversations.status, status));
    if (channel) filters.push(eq(conversations.channel, channel));

    const rows = await db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);

    const ids = rows.map((row) => row.id);
    const conversationMessages = ids.length
      ? await db.select().from(messages).where(inArray(messages.conversationId, ids))
      : [];
    const byConversation = new Map<string, typeof conversationMessages>();
    for (const message of conversationMessages) {
      const list = byConversation.get(message.conversationId) ?? [];
      list.push(message);
      byConversation.set(message.conversationId, list);
    }

    return json(
      rows.map((row) =>
        serializeConversation(
          row,
          (byConversation.get(row.id) ?? []).sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          ),
        ),
      ),
    );
  });
}
