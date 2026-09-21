import { eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { db } from "@/lib/db";
import { getIdentityAdapter } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const documents = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, tenant.orgId));
  const documentIds = documents.map((document) => document.id);
  const chunks = documentIds.length
    ? await db.select().from(knowledgeChunks).where(inArray(knowledgeChunks.documentId, documentIds))
    : [];

  const byDocument = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const list = byDocument.get(chunk.documentId) ?? [];
    list.push(chunk);
    byDocument.set(chunk.documentId, list);
  }

  const nodes: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  let sections = 0;
  for (const document of documents) {
    const documentChunks = byDocument.get(document.id) ?? [];
    nodes.push({
      id: document.id,
      label: document.title,
      group: "concept",
      concept_id: document.conceptId,
      tags: document.tags,
      val: Math.max(6, documentChunks.length * 2),
    });
    documentChunks.forEach((chunk, position) => {
      const sectionId = `${document.id}:${position}`;
      nodes.push({
        id: sectionId,
        label: chunk.heading || `${document.title} — part ${position + 1}`,
        group: "section",
        concept_id: document.conceptId,
        val: 2,
      });
      links.push({ source: document.id, target: sectionId, kind: "section" });
      sections += 1;
    });
  }

  const prefix = (conceptId: string) => conceptId.split("/")[0].split("-")[0];
  for (let index = 0; index < documents.length; index += 1) {
    const firstTags = new Set(documents[index].tags || []);
    for (let other = index + 1; other < documents.length; other += 1) {
      const related =
        [...firstTags].some((tag) => (documents[other].tags || []).includes(tag)) ||
        prefix(documents[index].conceptId) === prefix(documents[other].conceptId);
      if (related) {
        links.push({
          source: documents[index].id,
          target: documents[other].id,
          kind: "related",
        });
      }
    }
  }

  return NextResponse.json({
    nodes,
    links,
    stats: { concepts: documents.length, sections, links: links.length },
  });
}
