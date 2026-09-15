import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { listSkillsForOrg } from "@/lib/tools-integrations/skills-catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const skills = await listSkillsForOrg(tenant.orgId, profile.enabledSkills ?? []);
  return NextResponse.json(skills);
}
