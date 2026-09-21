import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDomains } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { decisionSchema, isNoOp, statusAfter, type DomainStatus } from "@/lib/email-domains";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * PATCH  → approve or revoke one domain.
 * DELETE → drop the row entirely.
 *
 * Deleting is for tidying a request that should never have been made — a typo,
 * a domain added twice under different spellings. Revoking is the normal way
 * to stop the worker using a domain, because it keeps the record.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const [existing] = await db
    .select()
    .from(emailDomains)
    .where(and(eq(emailDomains.organizationId, tenant.orgId), eq(emailDomains.id, id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Two managers pressing the same button is not an error, but it must not
  // rewrite decidedAt either — that timestamp is the audit trail.
  if (isNoOp(existing.status as DomainStatus, parsed.data.decision)) {
    return NextResponse.json(existing);
  }

  const now = new Date();
  const [updated] = await db
    .update(emailDomains)
    .set({
      status: statusAfter(parsed.data.decision),
      decidedBy: tenant.userId,
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(emailDomains.id, existing.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const { id } = await params;

  const [deleted] = await db
    .delete(emailDomains)
    .where(and(eq(emailDomains.organizationId, tenant.orgId), eq(emailDomains.id, id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
