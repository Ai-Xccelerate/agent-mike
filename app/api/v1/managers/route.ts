import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { fieldErrors } from "@/lib/identity-fields";
import { MANAGER_LIMITS, createManager, listManagers, managerCreateSchema } from "@/lib/managers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json({ managers: await listManagers(tenant.orgId), limits: MANAGER_LIMITS, canChange: isOrgAdmin(tenant.role) });
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = managerCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  const created = await createManager(tenant.orgId, parsed.data);
  return created.ok ? NextResponse.json(created.manager, { status: 201 }) : NextResponse.json({ error: created.error }, { status: created.status });
}
