import { featureEnabled, featureOff } from "@/lib/features";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getEvalRun } from "@/lib/eval-replay";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!featureEnabled("testCases")) return featureOff();
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const run = await getEvalRun(tenant.orgId, params.id);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
