import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { groupReviewItems, loadReviewItems } from "@/lib/review-queue";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * What to look at to make the worker better: replies rated bad, questions handed over with no article, and what the team
 * answered after a handoff, grouped by topic with the biggest first. Read-only.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const groups = groupReviewItems(await loadReviewItems(tenant.orgId));
  return NextResponse.json({ groups: groups.slice(0, 30), total: groups.reduce((sum, group) => sum + group.count, 0) });
}
