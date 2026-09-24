import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile, getOrganizationName } from "@/lib/bootstrap";
import { applyWorkerPatch } from "@/lib/worker-settings";
import { publicWorkerIdentity } from "@/lib/public-worker-identity";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const identity = getIdentityAdapter();
  const siteToken = (req.headers.get("x-worker-site-token") || "").trim();
  if (siteToken) {
    const widgetTenant = await identity.resolveWidgetRequest(req);
    if (!widgetTenant) {
      return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
    }
    const profile = await getOrCreateProfile(widgetTenant.orgId);
    return NextResponse.json(publicWorkerIdentity(profile));
  }

  const tenant = await identity.resolveManagerRequest(req);
  const [profile, organizationName] = await Promise.all([
    getOrCreateProfile(tenant.orgId),
    getOrganizationName(tenant.orgId),
  ]);
  return NextResponse.json({ ...profile, organizationName });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const result = await applyWorkerPatch(tenant.orgId, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
  }
  return NextResponse.json(result.profile);
}
