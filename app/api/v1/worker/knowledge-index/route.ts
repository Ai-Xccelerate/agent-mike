import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { knowledgeIndexStatus, pageQuestionsAfterSync, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { confluenceIndexSource } from "@/lib/tools-integrations/atlassian";

// Reads the DB and connected sources per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/** The searchable copy of the connected knowledge: how many pages and sections, when it last synced, and any error. */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const status = await knowledgeIndexStatus(tenant.orgId);
  const connected = (await confluenceIndexSource(tenant.orgId)) !== null;
  return NextResponse.json({ ...status, connected });
}

/**
 * Starts a sync now, then writes the page questions for new or changed pages. Both run in the background (the first
 * sync takes a minute or two); read the status to follow it.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  if ((await confluenceIndexSource(tenant.orgId)) === null) {
    return NextResponse.json({ error: "Confluence is not connected" }, { status: 404 });
  }
  void syncKnowledgeIndex(tenant.orgId).then(
    async (report) => {
      console.info("[knowledge-index] sync finished", JSON.stringify({ organizationId: tenant.orgId, ...report }));
      await pageQuestionsAfterSync(tenant.orgId, report);
    },
    (error) => console.warn("[knowledge-index] sync crashed", error instanceof Error ? error.message : error),
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
