import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { agentSkillsStatus } from "@/lib/integrations";
import { checkSkillsRepository, resolveSkillsCredentials } from "@/lib/skills-repository";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Skills > AIX Skills repository > "Test connection".
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = await agentSkillsStatus(profile.integrationsConfig, tenant.orgId);

  if (!status.available) {
    return NextResponse.json({
      ok: false,
      toolCount: 0,
      tools: [],
      categories: [],
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  const resolved = await resolveSkillsCredentials(tenant.orgId);
  if (!resolved) {
    return NextResponse.json({
      ok: false,
      toolCount: 0,
      tools: [],
      categories: [],
      error: status.unavailableReason,
      errorKind: "unconfigured",
    });
  }

  return NextResponse.json(await checkSkillsRepository(resolved.values));
}
