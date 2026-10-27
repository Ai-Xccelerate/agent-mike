import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { fieldErrors } from "@/lib/identity-fields";
import { EVAL_CASE_LIMITS, createEvalCase, evalCaseCreateSchema, listEvalCases } from "@/lib/eval-cases";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json({ cases: await listEvalCases(tenant.orgId), limits: EVAL_CASE_LIMITS, canChange: isOrgAdmin(tenant.role) });
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = evalCaseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  const created = await createEvalCase(tenant.orgId, tenant.userId, parsed.data);
  return created.ok ? NextResponse.json(created.evalCase, { status: 201 }) : NextResponse.json({ error: created.error }, { status: created.status });
}
