import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { listChanges } from "@/lib/change-log";

export const dynamic = "force-dynamic";

/** What the Assistant changed after confirmation, newest first, with the test score before and after. */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const changes = await listChanges(tenant.orgId, 20);
  return NextResponse.json({
    changes: changes.map(({ diff: _diff, ...rest }) => rest),
    canChange: isOrgAdmin(tenant.role),
  });
}
