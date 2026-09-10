import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetSites } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { ensureOrganization } from "@/lib/bootstrap";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await ensureOrganization(tenant.orgId);

  const [existing] = await db
    .select()
    .from(widgetSites)
    .where(eq(widgetSites.organizationId, tenant.orgId))
    .limit(1);

  if (existing) return NextResponse.json(existing);

  const [created] = await db
    .insert(widgetSites)
    .values({ organizationId: tenant.orgId, siteToken: randomBytes(24).toString("hex") })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
