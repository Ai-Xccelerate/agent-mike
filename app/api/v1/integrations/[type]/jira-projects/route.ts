import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { listJiraProjects, listServiceDesks } from "@/lib/tools-integrations/atlassian";

export const dynamic = "force-dynamic";

/**
 * The connected Jira's projects, the issue types each can take a handoff
 * ticket as and, for service desk projects, their request types, for
 * Settings > Integrations > Jira's dropdowns.
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
  const [projects, desks] = await Promise.all([
    listJiraProjects(tenant.orgId, row.composioConnectedAccountId),
    // A site without Jira Service Management just has no request types.
    listServiceDesks(tenant.orgId, row.composioConnectedAccountId),
  ]);
  if (!projects) return NextResponse.json({ error: "Couldn't reach Jira. Try again in a moment." }, { status: 502 });
  return NextResponse.json({
    projects: projects.map((project) => ({
      ...project,
      requestTypes: desks?.find((desk) => desk.projectKey === project.key)?.requestTypes ?? [],
    })),
  });
}
