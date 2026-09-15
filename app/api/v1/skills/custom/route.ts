import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { customSkillCreateSchema } from "@/lib/tools-integrations/custom-skill-schema";
import { createCustomSkill } from "@/lib/tools-integrations/custom-skills-repository";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const body = await req.json().catch(() => null);
  const parsed = customSkillCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }

  const created = await createCustomSkill({
    organizationId: tenant.orgId,
    name: parsed.data.name,
    description: parsed.data.description,
    requires: parsed.data.requires,
    body: parsed.data.body,
  });
  return NextResponse.json(created, { status: 201 });
}
