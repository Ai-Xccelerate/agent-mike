import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { replyTraces } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { traceAsText, type ReplyTrace } from "@/lib/reply-trace";

// Reads the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why the worker replied the way it did (lib/reply-trace.ts): what was in play, the pages she was given, what each check
 * said, and how closely her answer follows those pages. For the organization's managers only; the record is never part of
 * a message a customer receives. Replies written before this existed have none.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await db
    .select({ trace: replyTraces.trace })
    .from(replyTraces)
    .where(and(eq(replyTraces.messageId, params.id), eq(replyTraces.organizationId, tenant.orgId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "No record for this reply" }, { status: 404 });
  const trace = row.trace as unknown as ReplyTrace;
  return NextResponse.json({ trace, text: traceAsText(trace) });
}
