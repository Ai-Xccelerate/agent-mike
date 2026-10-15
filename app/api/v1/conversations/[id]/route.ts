import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { withNormalizedCitations } from "@/lib/citations";
import { livePendingApprovals, toPendingActionView } from "@/lib/assistant-agent";

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
  // Reopening an assistant thread from History should bring back its
  // Approve / Cancel card, not leave a proposal pending invisibly.
  const pendingActions =
    conversation.channel === "assistant"
      ? (await livePendingApprovals(tenant.orgId, conversation.id)).map(toPendingActionView)
      : [];
  return NextResponse.json({
    ...conversation,
    messages: msgs.map(withNormalizedCitations),
    pendingActions,
    canChange: isOrgAdmin(tenant.role),
  });
}

const VALID_STATUSES = ["open", "needs_human", "resolved", "closed"] as const;
const MAX_TEXT = 80;
const MAX_LABELS = 20;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status as string | undefined;
  const subject = body?.subject as string | undefined;
  const humanControlled = body?.humanControlled as boolean | undefined;
  const archived = body?.archived as boolean | undefined;
  const requestType = body?.requestType as string | null | undefined;
  const tier = body?.tier as string | null | undefined;
  const labels = body?.labels as string[] | undefined;

  if (
    status === undefined &&
    subject === undefined &&
    humanControlled === undefined &&
    archived === undefined &&
    requestType === undefined &&
    tier === undefined &&
    labels === undefined
  ) {
    return NextResponse.json(
      { error: "Provide status, subject, humanControlled, archived, requestType, tier, and/or labels" },
      { status: 400 },
    );
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

  // null clears a classification; a string sets it.
  for (const [field, value] of [["requestType", requestType], ["tier", tier]] as const) {
    if (value !== undefined && value !== null && (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT)) {
      return NextResponse.json({ error: `${field} must be a short non-empty string, or null to clear it` }, { status: 400 });
    }
  }
  if (
    labels !== undefined &&
    (!Array.isArray(labels) ||
      labels.length > MAX_LABELS ||
      labels.some((label) => typeof label !== "string" || !label.trim() || label.length > MAX_TEXT))
  ) {
    return NextResponse.json({ error: `labels must be up to ${MAX_LABELS} short non-empty strings` }, { status: 400 });
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
      ...(requestType !== undefined ? { requestType: requestType?.trim() ?? null } : {}),
      ...(tier !== undefined ? { tier: tier?.trim() ?? null } : {}),
      ...(labels !== undefined ? { labels: [...new Set(labels.map((label) => label.trim()))] } : {}),
      // A person's edit is final: the classifier leaves this ticket alone from now on.
      ...(requestType !== undefined || tier !== undefined || labels !== undefined ? { classificationSource: "manual" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id))
    .returning();

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, updated.id)).orderBy(messages.createdAt);
  return NextResponse.json({ ...updated, messages: msgs.map(withNormalizedCitations) });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const conversation = await loadOwned(params.id, tenant.orgId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  return NextResponse.json({ ok: true });
}
