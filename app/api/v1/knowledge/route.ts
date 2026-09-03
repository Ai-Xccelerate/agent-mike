import { desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { serializeKnowledge } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const documents = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.organizationId, tenant.orgId))
      .orderBy(desc(knowledgeDocuments.ingestedAt));

    const counts = documents.length
      ? await db
          .select({
            documentId: knowledgeChunks.documentId,
            count: sql<number>`count(*)::int`,
          })
          .from(knowledgeChunks)
          .groupBy(knowledgeChunks.documentId)
      : [];
    const countMap = new Map(counts.map((row) => [row.documentId, Number(row.count)]));
    return json(documents.map((document) => serializeKnowledge(document, countMap.get(document.id) ?? 0)));
  });
}
