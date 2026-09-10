import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";

/**
 * A manager replying directly — no agent turn runs. Distinct from
 * /api/v1/chat, which always invokes the harness.
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

  await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "manager",
    senderName: profile.managerName,
    body: text.trim(),
  });

  const [updated] = await db
    .update(conversations)
    .set({ status: "open", updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id))
    .returning();

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, updated.id)).orderBy(messages.createdAt);
  return NextResponse.json({ conversation: { ...updated, messages: msgs } });
}
