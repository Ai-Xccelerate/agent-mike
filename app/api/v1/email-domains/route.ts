import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDomains } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { countByStatus, createDomainSchema } from "@/lib/email-domains";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Email domains.
 *
 * GET  → every domain this org has a decision or a request on, plus counts.
 * POST → request a domain. It lands as pending; nothing is allowed by adding.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const rows = await db
    .select()
    .from(emailDomains)
    .where(eq(emailDomains.organizationId, tenant.orgId))
    // Pending first within each group the UI renders, then newest decision.
    .orderBy(desc(emailDomains.updatedAt), asc(emailDomains.domain));

  return NextResponse.json({ domains: rows, counts: countByStatus(rows) });
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const body = await req.json().catch(() => null);
  const parsed = createDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const { domain, reason, requestedBy } = parsed.data;

  // One row per domain per org. Asking again for something already known
  // updates that request rather than failing on the unique index — but it must
  // never quietly reset an approved or revoked domain back to pending, because
  // that would turn "ask again" into a way to undo someone's decision.
  const [existing] = await db
    .select()
    .from(emailDomains)
    .where(and(eq(emailDomains.organizationId, tenant.orgId), eq(emailDomains.domain, domain)))
    .limit(1);

  if (existing) {
    if (existing.status !== "pending") {
      return NextResponse.json(
        {
          error: `${domain} is already ${existing.status}`,
          errors: {
            domain:
              existing.status === "approved"
                ? `${domain} is already approved.`
                : `${domain} was revoked — re-approve it below instead of adding it again.`,
          },
          domain: existing,
        },
        { status: 409 },
      );
    }

    const [updated] = await db
      .update(emailDomains)
      .set({ reason: reason ?? existing.reason, updatedAt: new Date() })
      .where(eq(emailDomains.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(emailDomains)
    .values({ organizationId: tenant.orgId, domain, reason, requestedBy })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
