import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { listPendingApprovals } from "@/lib/tools-integrations/approval-repository";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Every write-capable tool that requires approval (e.g. the Gmail send/reply
 * tools in lib/agent.ts, and the manager Assistant's own propose_* tools)
 * queues into the same tool_approvals table. This lists what a manager still
 * has to decide, optionally scoped to one conversation.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const pending = await listPendingApprovals(tenant.orgId, conversationId);
  return NextResponse.json(pending);
}
