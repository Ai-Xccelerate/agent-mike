import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { fieldErrors } from "@/lib/identity-fields";
import { deleteManager, managerPatchSchema, updateManager } from "@/lib/managers";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = managerPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  const updated = await updateManager(tenant.orgId, params.id, parsed.data);
  return updated.ok ? NextResponse.json(updated.manager) : NextResponse.json({ error: updated.error }, { status: updated.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  return (await deleteManager(tenant.orgId, params.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
