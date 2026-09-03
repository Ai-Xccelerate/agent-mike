import { count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { knowledgeChunks } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { InvalidOKFDocument, ingestOkf } from "@/lib/knowledge";
import { serializeKnowledge } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const payload = (await req.json()) as {
      content?: string;
      concept_id?: string;
      source_path?: string | null;
    };
    if (!payload.content || !payload.concept_id) {
      return json({ error: "content and concept_id are required" }, 422);
    }
    try {
      const document = await ingestOkf(
        tenant.orgId,
        payload.content,
        payload.concept_id,
        payload.source_path,
      );
      if (!document) return json({ error: "Ingest failed" }, 500);
      const [countRow] = await db
        .select({ count: count() })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.documentId, document.id));
      return json(serializeKnowledge(document, Number(countRow?.count ?? 0)), 201);
    } catch (err) {
      if (err instanceof InvalidOKFDocument) return json({ error: err.message }, 422);
      throw err;
    }
  });
}
