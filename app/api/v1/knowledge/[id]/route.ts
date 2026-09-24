import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { editKnowledgeDocument, InvalidOKFDocument } from "@/lib/knowledge";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  await db
    .delete(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.id, params.id), eq(knowledgeDocuments.organizationId, tenant.orgId)));
  return NextResponse.json({ ok: true });
}

// The concept id is never accepted here — it's what the worker's own
// citations point back at, so it stays whatever it was created with. Only
// title and body are editable; description/tags an earlier file-ingest
// parsed out of real frontmatter are carried forward rather than erased.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const title = body?.title as string | undefined;
  const content = body?.content as string | undefined;
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.id, params.id), eq(knowledgeDocuments.organizationId, tenant.orgId)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Knowledge document not found" }, { status: 404 });
  }

  try {
    const doc = await editKnowledgeDocument(tenant.orgId, existing, title, content);
    return NextResponse.json(doc);
  } catch (err) {
    if (err instanceof InvalidOKFDocument) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
