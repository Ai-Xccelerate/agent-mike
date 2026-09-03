import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { knowledgeDocuments } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { documentId: string } },
) {
  return withTenant(req, async (tenant) => {
    const [document] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, params.documentId),
          eq(knowledgeDocuments.organizationId, tenant.orgId),
        ),
      )
      .limit(1);
    if (!document) return json({ error: "Knowledge document not found" }, 404);
    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, document.id));
    return new Response(null, { status: 204 });
  });
}
