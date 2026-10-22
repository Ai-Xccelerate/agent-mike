import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { computeOverview, OVERVIEW_PERIODS, type OverviewPeriod } from "@/lib/overview";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The Overview page's numbers for ?period=24h|7d|30d (default 24h), optionally narrowed by
 * ?channel=, ?request_type= and ?priority=, with the activity list at ?page= (zero-based).
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const asked = req.nextUrl.searchParams.get("period") ?? "24h";
  if (!(asked in OVERVIEW_PERIODS)) {
    return NextResponse.json({ error: `period must be one of ${Object.keys(OVERVIEW_PERIODS).join(", ")}` }, { status: 400 });
  }
  const params = req.nextUrl.searchParams;
  const pageValue = Number(params.get("page") ?? "0");
  const profile = await getOrCreateProfile(tenant.orgId);
  const overview = await computeOverview({
    organizationId: tenant.orgId,
    period: asked as OverviewPeriod,
    firstReplyTargetHours: profile.firstReplyTargetHours ?? null,
    filters: {
      channel: params.get("channel"),
      requestType: params.get("request_type"),
      priority: params.get("priority"),
    },
    page: Number.isFinite(pageValue) ? pageValue : 0,
  });
  return NextResponse.json(overview);
}
