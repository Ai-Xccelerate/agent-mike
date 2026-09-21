import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { customSkillPatchSchema } from "@/lib/tools-integrations/custom-skill-schema";
import { deleteCustomSkill, updateCustomSkill } from "@/lib/tools-integrations/custom-skills-repository";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const body = await req.json().catch(() => null);
  const parsed = customSkillPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }

  const updated = await updateCustomSkill(tenant.orgId, params.id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const deleted = await deleteCustomSkill(tenant.orgId, params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
