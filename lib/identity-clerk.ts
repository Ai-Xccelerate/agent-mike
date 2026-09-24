import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { workerUsers } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { isUniqueViolation } from "@/lib/worker-patch";
import { StandaloneIdentityAdapter, type IdentityAdapter, type TenantContext } from "@/lib/identity";

type Role = TenantContext["role"];

function normalizeRole(raw: string | null): Role {
  return raw === "owner" || raw === "admin" || raw === "member" ? raw : "member";
}

/**
 * Look up (or just-in-time provision) the worker_users row for a Clerk
 * identity. `middleware.ts` has already verified the Clerk JWT and the AIX
 * Core `agents/mike/access` entitlement before any route handler — including
 * this one — ever runs, so there is nothing left to re-verify here: this is
 * purely "does a local row exist for this already-trusted tenant yet".
 *
 * The real email comes from the session token's optional `email` claim
 * (forwarded by middleware as `x-aix-verified-email`, see
 * lib/clerk-core-auth.ts). Until the Clerk instance's session token is
 * customized to include it, `email` is null and a new row is seeded with a
 * placeholder `${clerkUserId}@clerk.local` address — only ever a uniqueness
 * key for the `(organizationId, email)` index, nothing sends mail to it. Once
 * the claim arrives, the next request replaces the placeholder in place.
 */
export async function ensureWorkerUser(
  orgId: string,
  clerkUserId: string,
  role: Role,
  email: string | null = null,
) {
  const placeholderEmail = `${clerkUserId}@clerk.local`;
  const [byClerkId] = await db
    .select()
    .from(workerUsers)
    .where(and(eq(workerUsers.organizationId, orgId), eq(workerUsers.clerkUserId, clerkUserId)))
    .limit(1);

  if (byClerkId) {
    const changes: Partial<typeof workerUsers.$inferInsert> = {};
    if (byClerkId.role !== role) changes.role = role;
    if (email && byClerkId.email !== email) changes.email = email;
    if (Object.keys(changes).length === 0) return byClerkId;
    try {
      const [updated] = await db
        .update(workerUsers)
        .set(changes)
        .where(eq(workerUsers.id, byClerkId.id))
        .returning();
      return updated;
    } catch (error) {
      // Another row in this org already holds that email (e.g. a hand-made
      // row for the same person) — keep the current email rather than fail
      // the request; the role change still applies.
      if (!isUniqueViolation(error) || !changes.email) throw error;
      if (!changes.role) return byClerkId;
      const [updated] = await db
        .update(workerUsers)
        .set({ role })
        .where(eq(workerUsers.id, byClerkId.id))
        .returning();
      return updated;
    }
  }

  // A row may already exist for this person if it was created by hand (or by
  // some other flow) before their Clerk account was linked — match it by the
  // real email, or the placeholder, so we backfill clerkUserId onto it
  // instead of creating a duplicate person under the same org. A row already
  // linked to a different Clerk user is never taken over.
  for (const candidate of email ? [email, placeholderEmail] : [placeholderEmail]) {
    const [byEmail] = await db
      .select()
      .from(workerUsers)
      .where(and(eq(workerUsers.organizationId, orgId), eq(workerUsers.email, candidate)))
      .limit(1);
    if (byEmail && !byEmail.clerkUserId) {
      const [updated] = await db
        .update(workerUsers)
        .set({ clerkUserId, role, ...(email ? { email } : {}) })
        .where(eq(workerUsers.id, byEmail.id))
        .returning();
      return updated;
    }
  }

  const values = { organizationId: orgId, clerkUserId, role };
  try {
    const [created] = await db
      .insert(workerUsers)
      .values({ ...values, email: email ?? placeholderEmail })
      .returning();
    return created;
  } catch (error) {
    // The real email is held by a row linked to another Clerk user — still
    // provision this person, under the placeholder.
    if (!isUniqueViolation(error) || !email) throw error;
    const [created] = await db
      .insert(workerUsers)
      .values({ ...values, email: placeholderEmail })
      .returning();
    return created;
  }
}

/**
 * Mike's platform adapter. `middleware.ts` verifies the Clerk JWT (and the
 * AIX Core `agents/mike/access` entitlement) and forwards the verified
 * tenant as `x-aix-verified-*` headers, stripping any client-supplied copies
 * first — this adapter only ever reads those trusted headers, it never
 * re-verifies the JWT itself.
 *
 * Keeping this as its own IdentityAdapter (rather than baking Clerk into
 * lib/identity.ts directly, as an earlier version of this integration did)
 * means every other Foundation route stays tenant- and vendor-agnostic; only
 * this one file, and the `MIKE_PLATFORM_AUTH=true` switch in
 * lib/identity.ts's defaultAdapter(), know Clerk exists.
 */
export class ClerkIdentityAdapter implements IdentityAdapter {
  async resolveManagerRequest(req: NextRequest): Promise<TenantContext> {
    const orgId = (req.headers.get("x-aix-verified-org-id") || "").trim();
    const userId = (req.headers.get("x-aix-verified-user-id") || "").trim();
    const role = normalizeRole(req.headers.get("x-aix-verified-role"));
    const email = (req.headers.get("x-aix-verified-email") || "").trim() || null;
    if (!orgId || !userId) {
      throw new Error("Verified Clerk tenant context is missing");
    }

    await ensureOrganization(orgId);
    await ensureWorkerUser(orgId, userId, role, email);

    return { orgId, userId, role, source: "clerk" };
  }

  /** Widget traffic is unauthenticated by design — same site-token resolution as everywhere else. */
  async resolveWidgetRequest(req: NextRequest): Promise<TenantContext | null> {
    return new StandaloneIdentityAdapter().resolveWidgetRequest(req);
  }
}
