import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { revertChange } from "@/lib/change-log";
import { startReplay } from "@/lib/eval-replay";

export const dynamic = "force-dynamic";

/** Undoes one change, then replays the test cases so the score after the undo is on record. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const { id } = params;
  const result = await revertChange(tenant.orgId, id, tenant.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  void startReplay({ organizationId: tenant.orgId, triggeredBy: tenant.userId }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
