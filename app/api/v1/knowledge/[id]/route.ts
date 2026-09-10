import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await db
    .delete(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.id, params.id), eq(knowledgeDocuments.organizationId, tenant.orgId)));
  return NextResponse.json({ ok: true });
}
