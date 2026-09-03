import { count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { knowledgeChunks } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { InvalidOKFDocument, ingestUpload } from "@/lib/knowledge";
import { serializeKnowledge } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const form = await req.formData();
    const files = form.getAll("files");
    const results: Array<Record<string, unknown>> = [];

    for (const entry of files) {
      if (!(entry instanceof File)) continue;
      try {
        const buffer = Buffer.from(await entry.arrayBuffer());
        const document = await ingestUpload(tenant.orgId, entry.name || "document", buffer);
        if (!document) throw new Error("Ingest returned no document");
        const [countRow] = await db
          .select({ count: count() })
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.documentId, document.id));
        results.push({
          filename: entry.name,
          ok: true,
          document: serializeKnowledge(document, Number(countRow?.count ?? 0)),
        });
      } catch (err) {
        results.push({
          filename: entry.name,
          ok: false,
          error: err instanceof InvalidOKFDocument ? err.message : `Could not process file: ${err}`,
        });
      }
    }

    return json(results);
  });
}
