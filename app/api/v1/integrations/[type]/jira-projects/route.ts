import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { listJiraProjects } from "@/lib/tools-integrations/atlassian";

export const dynamic = "force-dynamic";

/**
 * The connected Jira's projects and the issue types each can take a handoff
 * ticket as, for Settings > Integrations > Jira's dropdowns.
 */
export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const row = await getConnectionForOrg(tenant.orgId, params.type);
  if (!row || row.system !== "jira") {
    return NextResponse.json({ error: "Jira isn't connected here" }, { status: 404 });
  }
  if (row.status !== "active" || !row.composioConnectedAccountId) {
    return NextResponse.json({ error: "Finish connecting Jira first." }, { status: 409 });
  }
  const projects = await listJiraProjects(tenant.orgId, row.composioConnectedAccountId);
  if (!projects) return NextResponse.json({ error: "Couldn't reach Jira. Try again in a moment." }, { status: 502 });
  return NextResponse.json({ projects });
}
