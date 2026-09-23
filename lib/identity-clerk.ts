import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { workerUsers } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
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
 * There is no email claim in the verified headers middleware forwards (Mike
 * only gets org id / user id / role from the Clerk JWT, see
 * lib/clerk-core-auth.ts), so a freshly provisioned row is seeded with a
 * placeholder `${clerkUserId}@clerk.local` address rather than a real one.
 * That placeholder is only ever used as a uniqueness key for the legacy
 * `(organizationId, email)` index — nothing sends mail to it. A real email
 * should be backfilled once one is available (e.g. by widening the Clerk JWT
 * template, or calling Clerk's Backend API) rather than treating this as a
 * finished integration.
 */
export async function ensureWorkerUser(orgId: string, clerkUserId: string, role: Role) {
  const [byClerkId] = await db
    .select()
    .from(workerUsers)
    .where(and(eq(workerUsers.organizationId, orgId), eq(workerUsers.clerkUserId, clerkUserId)))
    .limit(1);

  if (byClerkId) {
    if (byClerkId.role !== role) {
      const [updated] = await db
        .update(workerUsers)
        .set({ role })
        .where(eq(workerUsers.id, byClerkId.id))
        .returning();
      return updated;
    }
    return byClerkId;
  }

  // A row may already exist for this person if it was created by hand (or by
  // some other flow) before their Clerk account was linked — match it by the
  // placeholder/real email so we backfill clerkUserId onto it instead of
  // creating a duplicate person under the same org.
  const placeholderEmail = `${clerkUserId}@clerk.local`;
  const [byEmail] = await db
    .select()
    .from(workerUsers)
    .where(and(eq(workerUsers.organizationId, orgId), eq(workerUsers.email, placeholderEmail)))
    .limit(1);

  if (byEmail) {
    const [updated] = await db
      .update(workerUsers)
      .set({ clerkUserId, role })
      .where(eq(workerUsers.id, byEmail.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(workerUsers)
    .values({
      organizationId: orgId,
      clerkUserId,
      email: placeholderEmail,
      role,
    })
    .returning();
  return created;
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
    if (!orgId || !userId) {
      throw new Error("Verified Clerk tenant context is missing");
    }

    await ensureOrganization(orgId);
    await ensureWorkerUser(orgId, userId, role);

    return { orgId, userId, role, source: "clerk" };
  }

  /** Widget traffic is unauthenticated by design — same site-token resolution as everywhere else. */
  async resolveWidgetRequest(req: NextRequest): Promise<TenantContext | null> {
    return new StandaloneIdentityAdapter().resolveWidgetRequest(req);
  }
}
