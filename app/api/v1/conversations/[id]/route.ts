import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

async function loadOwned(id: string, orgId: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conversation || conversation.organizationId !== orgId) return null;
  return conversation;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt);
  return NextResponse.json({ ...conversation, messages: msgs });
}

const VALID_STATUSES = ["open", "needs_human", "resolved", "closed"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status as string | undefined;
  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const [updated] = await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id))
    .returning();

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, updated.id)).orderBy(messages.createdAt);
  return NextResponse.json({ ...updated, messages: msgs });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  return NextResponse.json({ ok: true });
}
