import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerUsers } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { fetchCoreOrgRoster } from "@/lib/core-roster";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

function bearerToken(req: NextRequest): string | null {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * The team roster lives in AIX Core, not here — this mirrors it, the same
 * way lib/identity-clerk.ts's ensureWorkerUser JIT-provisions worker_users
 * from Clerk claims. Core's roster is tried first (it knows about everyone
 * invited, not only people who've personally opened Mike at least once);
 * the local worker_users mirror is only a fallback for when Core itself is
 * unreachable. There is deliberately no write endpoint here anymore —
 * invite/role-change/remove all happen in AIX Core's own pages.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const localRows = await db.select().from(workerUsers).where(eq(workerUsers.organizationId, tenant.orgId));
  const signedUpIds = new Set(localRows.map((r) => r.clerkUserId).filter((id): id is string => Boolean(id)));

  const coreRoster = await fetchCoreOrgRoster(bearerToken(req));

  const members = coreRoster
    ? coreRoster
        .filter((m) => m.hasAccess)
        .map((m) => ({
          userId: m.userId,
          email: m.email,
          displayName: m.displayName,
          role: m.role ?? "member",
          signedUp: signedUpIds.has(m.userId),
        }))
    : localRows.map((r) => ({
        userId: r.clerkUserId ?? r.id,
        email: r.email,
        displayName: r.name,
        role: r.role,
        signedUp: true,
      }));

  return NextResponse.json({ members, source: coreRoster ? "core" : "local-mirror" });
}
