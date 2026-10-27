import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { listEvalRuns, startReplay } from "@/lib/eval-replay";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json({ runs: await listEvalRuns(tenant.orgId, 10), canChange: isOrgAdmin(tenant.role) });
}

/** Starts a replay of the organization's test cases. Returns at once; poll the run for its progress and score. */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const started = await startReplay({ organizationId: tenant.orgId, triggeredBy: tenant.userId });
  return started.ok ? NextResponse.json({ runId: started.runId }, { status: 202 }) : NextResponse.json({ error: started.error }, { status: started.status });
}
