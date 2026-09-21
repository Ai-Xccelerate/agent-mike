import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getSkillForOrg } from "@/lib/tools-integrations/skills-catalog";

export const dynamic = "force-dynamic";

// The only place a skill's full instructions (its `body`) are exposed to the
// admin console — the list endpoint (GET /skills) deliberately strips them to
// keep that response small. Works for both catalog and this org's own custom
// skills, since getSkillForOrg already does that lookup for the agent runtime.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const skill = await getSkillForOrg(tenant.orgId, params.id);
  if (!skill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(skill);
}
