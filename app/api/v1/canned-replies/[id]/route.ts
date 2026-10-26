import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { fieldErrors } from "@/lib/identity-fields";
import { cannedReplyPatchSchema, deleteCannedReply, updateCannedReply } from "@/lib/canned-replies";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = cannedReplyPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  const updated = await updateCannedReply(tenant.orgId, params.id, parsed.data);
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  return (await deleteCannedReply(tenant.orgId, params.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
