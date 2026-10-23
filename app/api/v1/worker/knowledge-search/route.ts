import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { isOrgAdmin } from "@/lib/org-roles";
import { retrieveKnowledge } from "@/lib/retrieval";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConfluenceKnowledgeError, confluenceInventory, confluenceListingProbe, searchConfluenceKnowledge } from "@/lib/tools-integrations/atlassian";
import { searchKnowledgeIndex } from "@/lib/knowledge-search";

// Reads connected sources per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * What Eva's search finds, for a manager checking it.
 *   ?q=<question>   the pages she would be given for that question, best first, with where each came from
 *   ?q=...&full=1   the same, with the full text she was given for each page (to check an answer against it)
 *   ?q=...&engine=index|live   force the saved copy, or the live Confluence search, whatever the switch says (to compare them)
 *   ?inventory=1    every page she can search in the connected Confluence spaces
 *   ?probe=1        what this deployment can do for a search index: database features, and what Confluence's page
 *                   listing returns (field names and sizes only, never page text)
 * Read-only: nothing here changes a setting or writes to Confluence.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;

  if (params.get("probe")) {
    const version = (await db.execute<{ version: string }>(sql`select version() as version`)).rows[0];
    const extensions = (
      await db.execute<{ name: string; default_version: string | null; installed_version: string | null }>(
        sql`select name, default_version, installed_version from pg_available_extensions where name in ('vector', 'pg_trgm') order by name`,
      )
    ).rows;
    const privileges = (
      await db.execute<{ is_superuser: boolean; can_create: boolean }>(
        sql`select (select rolsuper from pg_roles where rolname = current_user) as is_superuser, has_database_privilege(current_user, current_database(), 'CREATE') as can_create`,
      )
    ).rows[0];
    let listing: unknown = null;
    try {
      listing = await confluenceListingProbe(tenant.orgId);
    } catch (error) {
      listing = { error: error instanceof Error ? error.message : "probe failed" };
    }
    return NextResponse.json({ database: { version: version?.version ?? null, extensions, ...privileges }, confluence: listing });
  }

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
  const engine = params.get("engine");
  if (engine === "index" || engine === "live") {
    const t0 = Date.now();
    const found =
      engine === "index"
        ? await searchKnowledgeIndex(tenant.orgId, question, { limit: 6 })
        : { matches: (await searchConfluenceKnowledge(tenant.orgId, question, 5)) ?? [], timings: null, details: [] };
    return NextResponse.json({
      question,
      engine,
      ms: Date.now() - t0,
      timings: found.timings,
      details: found.details,
      matches: found.matches.map((match, index) => ({
        position: index + 1,
        documentId: match.documentId,
        title: match.title,
        heading: match.heading,
        chars: match.content.length,
        preview: match.content.slice(0, 160),
        ...(params.get("full") ? { content: match.content } : {}),
      })),
    });
  }
  const profile = await getOrCreateProfile(tenant.orgId);
  const t0 = Date.now();
  const { matches, sources } = await retrieveKnowledge(profile, question);
  return NextResponse.json({
    question,
    ms: Date.now() - t0,
    sources,
    matches: matches.map((match, index) => ({
      position: index + 1,
      documentId: match.documentId,
      title: match.title,
      chars: match.content.length,
      preview: match.content.slice(0, 160),
      ...(params.get("full") ? { content: match.content } : {}),
    })),
  });
}
