import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { withNormalizedCitations } from "@/lib/citations";
import { EmailReplyError, sendManagerEmailReply } from "@/lib/email-channel";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * A manager replying directly — no agent turn runs. Distinct from
 * /api/v1/chat, which always invokes the harness.
 *
 * Replying takes the conversation over: the agent stops answering it until a
 * manager hands it back, so the customer never gets two voices. On an email
 * conversation the reply is emailed to the customer in the same thread, and
 * nothing is saved if that send fails, so the manager can simply retry.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, params.id)).limit(1);
  if (!conversation || conversation.organizationId !== tenant.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = body?.body as string | undefined;
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const profile = await getOrCreateProfile(tenant.orgId);

  let externalMessageId: string | null = null;
  if (conversation.channel === "email") {
    try {
      externalMessageId = await sendManagerEmailReply(conversation, text.trim());
    } catch (error) {
      if (error instanceof EmailReplyError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "manager",
    senderName: profile.managerName,
    body: text.trim(),
    externalMessageId,
  });

  const [updated] = await db
    .update(conversations)
    .set({ status: "open", humanControlled: true, assignedTo: profile.managerName, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id))
    .returning();

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, updated.id)).orderBy(messages.createdAt);
  return NextResponse.json({
    conversation: { ...updated, messages: msgs.map(withNormalizedCitations) },
  });
}
