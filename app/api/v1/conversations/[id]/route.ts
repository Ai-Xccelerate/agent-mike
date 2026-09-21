import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { withNormalizedCitations } from "@/lib/citations";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

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
  return NextResponse.json({ ...conversation, messages: msgs.map(withNormalizedCitations) });
}

const VALID_STATUSES = ["open", "needs_human", "resolved", "closed"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status as string | undefined;
  const subject = body?.subject as string | undefined;
  const humanControlled = body?.humanControlled as boolean | undefined;
  const archived = body?.archived as boolean | undefined;

  if (status === undefined && subject === undefined && humanControlled === undefined && archived === undefined) {
    return NextResponse.json({ error: "Provide status, subject, humanControlled, and/or archived" }, { status: 400 });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (subject !== undefined && !subject.trim()) {
    return NextResponse.json({ error: "subject cannot be empty" }, { status: 400 });
  }
  if (humanControlled !== undefined && typeof humanControlled !== "boolean") {
    return NextResponse.json({ error: "humanControlled must be a boolean" }, { status: 400 });
  }
  if (archived !== undefined && typeof archived !== "boolean") {
    return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
  }

  const profile = humanControlled ? await getOrCreateProfile(tenant.orgId) : null;

  const [updated] = await db
    .update(conversations)
    .set({
      ...(status !== undefined ? { status } : {}),
      ...(subject !== undefined ? { subject: subject.trim() } : {}),
      ...(humanControlled !== undefined ? { humanControlled } : {}),
      ...(humanControlled ? { assignedTo: profile!.managerName } : {}),
      ...(archived !== undefined ? { archived } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id))
    .returning();

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, updated.id)).orderBy(messages.createdAt);
  return NextResponse.json({ ...updated, messages: msgs.map(withNormalizedCitations) });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  return NextResponse.json({ ok: true });
}
