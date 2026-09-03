import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
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
      const documentChunks = (byDocument.get(document.id) ?? []).sort((a, b) => a.position - b.position);
      nodes.push({
        id: document.id,
        label: document.title,
        group: "concept",
        type: document.type,
        concept_id: document.conceptId,
        tags: document.tags,
        val: Math.max(6, documentChunks.length * 2),
      });
      for (const chunk of documentChunks) {
        const sectionId = `${document.id}:${chunk.position}`;
        nodes.push({
          id: sectionId,
          label: chunk.heading || `${document.title} — part ${chunk.position + 1}`,
          group: "section",
          type: document.type,
          concept_id: document.conceptId,
          val: 2,
        });
        links.push({ source: document.id, target: sectionId, kind: "section" });
        sections += 1;
      }
    }

    const prefix = (conceptId: string) => conceptId.split("/")[0].split("-")[0];
    for (let i = 0; i < documents.length; i += 1) {
      const firstTags = new Set(documents[i].tags || []);
      for (let j = i + 1; j < documents.length; j += 1) {
        const related =
          [...firstTags].some((tag) => (documents[j].tags || []).includes(tag)) ||
          prefix(documents[i].conceptId) === prefix(documents[j].conceptId);
        if (related) links.push({ source: documents[i].id, target: documents[j].id, kind: "related" });
      }
    }

    return json({
      nodes,
      links,
      stats: { concepts: documents.length, sections, links: links.length },
    });
  });
}
