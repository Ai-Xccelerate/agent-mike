import { NextRequest } from "next/server";
import { json, withTenant } from "@/lib/http";
import { ensureWidgetSiteForOrg, serializeWidgetSite } from "@/lib/widget-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current org's public widget site token (created on first access). */
export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const site = await ensureWidgetSiteForOrg(tenant.orgId);
    return json({ site: serializeWidgetSite(site) });
  });
}
