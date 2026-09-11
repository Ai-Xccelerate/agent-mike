import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { agentWikiStatus } from "@/lib/integrations";
import { checkAgentWikiConnection } from "@/lib/agent-wiki";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Tools > Internal tools > Agent Wiki > "Test connection".
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = agentWikiStatus(profile.integrationsConfig);

  if (!status.available) {
    return NextResponse.json({
      ok: false,
      toolCount: 0,
      tools: [],
      spaces: [],
      canWrite: false,
      searchTool: null,
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  return NextResponse.json(await checkAgentWikiConnection());
}
