import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations } from "@/db/schema";
import { db } from "@/lib/db";
import { loadConversation } from "@/lib/conversations";
import { json, withTenant } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { serializeConversation } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["open", "resolved", "needs_human", "human_active", "closed"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  return withTenant(req, async (tenant) => {
    const status = req.nextUrl.searchParams.get("conversation_status");
    if (!status || !ALLOWED.has(status)) {
      return json({ error: `Status must be one of ${[...ALLOWED].sort().join(", ")}` }, 422);
    }
    const loaded = await loadConversation(tenant.orgId, params.conversationId);
    if (!loaded) return json({ error: "Conversation not found" }, 404);
    const profile = await getProfile(tenant.orgId);
    const assignedTo = status === "human_active" ? profile.managerName : loaded.conversation.assignedTo;
    const [updated] = await db
      .update(conversations)
      .set({ status, assignedTo, updatedAt: new Date() })
      .where(eq(conversations.id, loaded.conversation.id))
      .returning();
    return json(serializeConversation(updated, loaded.conversationMessages));
  });
}
