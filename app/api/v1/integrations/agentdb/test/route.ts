import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { agentDbStatus, readAgentDbSettings } from "@/lib/integrations";
import { agentDbAgentId, agentDbOrgId, checkAgentDbConnection } from "@/lib/agentdb";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Integrations > AgentDB > "Test connection".
 *
 * Proves the whole internal path end to end: the MCP handshake plus the
 * mandatory first `get_agents_md` call. Anything short of that can pass while
 * real queries still fail, which is exactly the silent misconfiguration this
 * button exists to catch.
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = agentDbStatus(profile.integrationsConfig, tenant.orgId);

  if (!status.available) {
    return NextResponse.json({
      ok: false,
      mcpReachable: false,
      agentsMdBytes: 0,
      workspaceId: null,
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  const settings = readAgentDbSettings(profile.integrationsConfig);
  const result = await checkAgentDbConnection({
    orgId: agentDbOrgId(tenant.orgId, settings.orgId),
    agentId: agentDbAgentId(profile.slug),
    workspaceId: settings.workspaceId,
  });

  return NextResponse.json(result);
}
