import { and, avg, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations } from "@/db/schema";
import { db } from "@/lib/db";
import { getIdentityAdapter } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const org = eq(conversations.organizationId, tenant.orgId);
  const [[openRow], [needsRow], [resolvedRow], [totalRow], [avgRow]] = await Promise.all([
    db.select({ value: count() }).from(conversations).where(and(org, eq(conversations.status, "open"))),
    db
      .select({ value: count() })
      .from(conversations)
      .where(and(org, eq(conversations.status, "needs_human"))),
    db
      .select({ value: count() })
      .from(conversations)
      .where(and(org, eq(conversations.status, "resolved"))),
    db.select({ value: count() }).from(conversations).where(org),
    db.select({ value: avg(conversations.confidence) }).from(conversations).where(org),
  ]);

  const openCount = Number(openRow?.value ?? 0);
  const needsHuman = Number(needsRow?.value ?? 0);
  const resolved = Number(resolvedRow?.value ?? 0);
  const total = Number(totalRow?.value ?? 0);
  const average = Number(avgRow?.value ?? 0);
  const autonomous = Math.max(total - needsHuman, 0);
  return NextResponse.json({
    open_conversations: openCount,
    resolved_today: resolved,
    needs_human: needsHuman,
    auto_resolution_rate: total ? Math.round((autonomous / total) * 1000) / 10 : 0,
    avg_confidence: Math.round(average * 1000) / 10,
  });
}
