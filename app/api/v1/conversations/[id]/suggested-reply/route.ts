import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile, getOrganizationName } from "@/lib/bootstrap";
import { INTERNAL_CONVERSATION_CHANNELS } from "@/lib/assistant-agent";
import { suggestReply } from "@/lib/suggested-reply";

// Reads the DB and calls the model per request, never prerender or cache.
export const dynamic = "force-dynamic";

/**
 * A reply the manager can edit and send. Nothing is stored and nothing is sent: the draft only comes back here, and
 * sending still goes through POST /conversations/:id/messages like any manager reply.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, params.id)).limit(1);
  if (!conversation || conversation.organizationId !== tenant.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((INTERNAL_CONVERSATION_CHANNELS as readonly string[]).includes(conversation.channel)) {
    return NextResponse.json({ error: "Only customer conversations have suggested replies." }, { status: 422 });
  }

  const [profile, organizationName, transcript] = await Promise.all([
    getOrCreateProfile(tenant.orgId),
    getOrganizationName(tenant.orgId),
    db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt),
  ]);

  const result = await suggestReply({ organizationId: tenant.orgId, organizationName, profile, conversation, transcript });
  if (!result.ok) {
    const error =
      result.reason === "no_model"
        ? "The AI model is not available, so no reply can be suggested."
        : result.reason === "no_customer_message"
          ? "There is no customer message to reply to yet."
          : "Could not write a suggestion. Try again.";
    return NextResponse.json({ error }, { status: result.reason === "failed" ? 502 : 422 });
  }
  return NextResponse.json({ body: result.body, sources: result.sources, needsCheck: result.needsCheck });
}
