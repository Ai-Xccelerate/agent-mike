import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { scribeStatus } from "@/lib/integrations";
import { checkScribeConnection } from "@/lib/scribe";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Integrations > Scribe > "Test connection".
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = scribeStatus(profile.integrationsConfig);

  if (!status.available) {
    return NextResponse.json({
      ok: false,
      meetingCount: 0,
      recentMeetings: [],
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  return NextResponse.json(await checkScribeConnection());
}
