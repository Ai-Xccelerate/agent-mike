import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations, messages } from "@/db/schema";
import { replyToEmail } from "@/lib/nylas-mail";
import { loadConversation } from "@/lib/conversations";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { serializeConversation, serializeMessage } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  return withTenant(req, async (tenant) => {
    const payload = (await req.json()) as { body?: string };
    const body = (payload.body || "").trim();
    if (!body) return json({ error: "Reply body is required" }, 422);

    const loaded = await loadConversation(tenant.orgId, params.conversationId);
    if (!loaded) return json({ error: "Conversation not found" }, 404);
    const profile = await getProfile(tenant.orgId);

    const [saved] = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId: loaded.conversation.id,
        senderType: "human",
        senderName: profile.managerName,
        body,
      })
      .returning();

    await db
      .update(conversations)
      .set({
        status: "human_active",
        assignedTo: profile.managerName,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, loaded.conversation.id));

    if (loaded.conversation.channel === "email") {
      const lastCustomer = [...loaded.conversationMessages]
        .reverse()
        .find((item) => item.senderType === "customer");
      const externalId = lastCustomer?.metadata?.external_message_id;
      if (typeof externalId === "string" && externalId) {
        try {
          await replyToEmail(tenant.orgId, externalId, body);
        } catch (err) {
          console.warn("[human-reply] Nylas send failed", err);
        }
      }
    }

    const refreshed = await loadConversation(tenant.orgId, loaded.conversation.id);
    return json({
      message: serializeMessage(saved),
      conversation: refreshed
        ? serializeConversation(refreshed.conversation, refreshed.conversationMessages)
        : null,
    });
  });
}
