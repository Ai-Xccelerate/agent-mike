import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { cleanOrganizationName, isPlaceholderOrganizationName } from "@/lib/bootstrap";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";

export const dynamic = "force-dynamic";

/**
 * Stores the organization's real display name. The platform sends only an id,
 * so the signed-in admin's browser passes along the name Clerk shows for the
 * org. It is used in the worker's prompt ("an AI worker for <name>"), which
 * is why only admins can set it and why it is kept to one short plain line.
 */
export async function PUT(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanOrganizationName(body?.name);
  if (!name || isPlaceholderOrganizationName(name, tenant.orgId)) {
    return NextResponse.json({ error: "A real organization name is required" }, { status: 422 });
  }

  await db.update(organizations).set({ name }).where(eq(organizations.id, tenant.orgId));
  return NextResponse.json({ name });
}
