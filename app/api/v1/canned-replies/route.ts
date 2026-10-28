import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { fieldErrors } from "@/lib/identity-fields";
import { CANNED_LIMITS, cannedReplyCreateSchema, createCannedReply, listCannedReplies } from "@/lib/canned-replies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json({ replies: await listCannedReplies(tenant.orgId), limits: CANNED_LIMITS, canChange: isOrgAdmin(tenant.role) });
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = cannedReplyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  const created = await createCannedReply(tenant.orgId, parsed.data);
  if (!created) return NextResponse.json({ error: `You can keep at most ${CANNED_LIMITS.perOrganization} canned replies.` }, { status: 409 });
  return NextResponse.json(created, { status: 201 });
}
