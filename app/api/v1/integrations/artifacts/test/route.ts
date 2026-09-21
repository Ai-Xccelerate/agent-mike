import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { artifactsStatus } from "@/lib/integrations";
import { checkArtifactsConnection } from "@/lib/artifacts";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Tools > Internal tools > Agent Artifacts > "Test connection".
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = artifactsStatus(profile.integrationsConfig);

  if (!status.available) {
    return NextResponse.json({
      ok: false,
      toolCount: 0,
      tools: [],
      brandKits: [],
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  return NextResponse.json(await checkArtifactsConnection());
}
