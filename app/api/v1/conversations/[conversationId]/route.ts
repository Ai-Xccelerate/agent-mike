import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations } from "@/db/schema";
import { db } from "@/lib/db";
import { loadConversation } from "@/lib/conversations";
import { json, withTenant } from "@/lib/http";
import { serializeConversation } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  return withTenant(req, async (tenant) => {
    const loaded = await loadConversation(tenant.orgId, params.conversationId);
    if (!loaded) return json({ error: "Conversation not found" }, 404);
    return json(serializeConversation(loaded.conversation, loaded.conversationMessages));
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  return withTenant(req, async (tenant) => {
    const loaded = await loadConversation(tenant.orgId, params.conversationId);
    if (!loaded) return json({ error: "Conversation not found" }, 404);
    await db.delete(conversations).where(eq(conversations.id, loaded.conversation.id));
    return new Response(null, { status: 204 });
  });
}
