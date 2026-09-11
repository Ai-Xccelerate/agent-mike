import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { integrationStatuses } from "@/lib/integrations";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/** Settings > Integrations: every integration and whether it is actually running. */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  return NextResponse.json({
    integrations: integrationStatuses(profile.integrationsConfig, tenant.orgId),
  });
}
