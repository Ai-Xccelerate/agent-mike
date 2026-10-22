import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { isOrgAdmin } from "@/lib/org-roles";
import { retrieveKnowledge } from "@/lib/retrieval";
import { ConfluenceKnowledgeError, confluenceInventory } from "@/lib/tools-integrations/atlassian";

// Reads connected sources per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * What Eva's search finds, for a manager checking it.
 *   ?q=<question>   the pages she would be given for that question, best first, with where each came from
 *   ?inventory=1    every page she can search in the connected Confluence spaces
 * Read-only: nothing here changes a setting or writes to Confluence.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;

  if (params.get("inventory")) {
    try {
      const inventory = await confluenceInventory(tenant.orgId);
      if (!inventory) return NextResponse.json({ error: "Confluence is not connected" }, { status: 404 });
      return NextResponse.json({ count: inventory.pages.length, ...inventory });
    } catch (error) {
      if (error instanceof ConfluenceKnowledgeError) return NextResponse.json({ error: error.message }, { status: 502 });
      throw error;
    }
  }

  const question = (params.get("q") ?? "").trim();
  if (!question) return NextResponse.json({ error: "q or inventory is required" }, { status: 400 });
  const profile = await getOrCreateProfile(tenant.orgId);
  const { matches, sources } = await retrieveKnowledge(profile, question);
  return NextResponse.json({
    question,
    sources,
    matches: matches.map((match, index) => ({
      position: index + 1,
      documentId: match.documentId,
      title: match.title,
      chars: match.content.length,
      preview: match.content.slice(0, 160),
    })),
  });
}
