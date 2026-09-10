import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { ingestOkf, InvalidOKFDocument, wrapAsOkf } from "@/lib/knowledge";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const docs = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, tenant.orgId))
    .orderBy(desc(knowledgeDocuments.createdAt));
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const conceptId = body?.conceptId as string | undefined;
  const title = body?.title as string | undefined;
  const content = body?.content as string | undefined;
  const isOkf = Boolean(body?.isOkf);

  if (!conceptId || !content) {
    return NextResponse.json({ error: "conceptId and content are required" }, { status: 400 });
  }

  const raw = isOkf ? content : wrapAsOkf(conceptId, title || conceptId, content);

  try {
    const doc = await ingestOkf(tenant.orgId, conceptId, raw);
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidOKFDocument) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
