import { and, avg, count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const org = eq(conversations.organizationId, tenant.orgId);
    const [openRow] = await db
      .select({ value: count() })
      .from(conversations)
      .where(and(org, eq(conversations.status, "open")));
    const [needsRow] = await db
      .select({ value: count() })
      .from(conversations)
      .where(and(org, eq(conversations.status, "needs_human")));
    const [resolvedRow] = await db
      .select({ value: count() })
      .from(conversations)
      .where(and(org, eq(conversations.status, "resolved")));
    const [totalRow] = await db.select({ value: count() }).from(conversations).where(org);
    const [avgRow] = await db.select({ value: avg(conversations.confidence) }).from(conversations).where(org);

    const openCount = Number(openRow?.value ?? 0);
    const needsHuman = Number(needsRow?.value ?? 0);
    const resolved = Number(resolvedRow?.value ?? 0);
    const total = Number(totalRow?.value ?? 0);
    const average = Number(avgRow?.value ?? 0);
    const autonomous = Math.max(total - needsHuman, 0);

    return json({
      open_conversations: openCount,
      resolved_today: resolved,
      needs_human: needsHuman,
      auto_resolution_rate: total ? Math.round((autonomous / total) * 1000) / 10 : 0,
      avg_confidence: Math.round(average * 1000) / 10,
    });
  });
}
