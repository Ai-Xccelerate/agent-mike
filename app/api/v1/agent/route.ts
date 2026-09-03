import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { agentProfiles } from "@/db/schema";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { getProfile, PROFILE_PATCH, serializeProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const profile = await getProfile(tenant.orgId);
    return json(serializeProfile(profile));
  });
}

export async function PATCH(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const profile = await getProfile(tenant.orgId);
    const payload = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, column] of Object.entries(PROFILE_PATCH)) {
      if (payload[key] !== undefined) updates[column] = payload[key];
    }
    const [saved] = await db
      .update(agentProfiles)
      .set(updates)
      .where(eq(agentProfiles.id, profile.id))
      .returning();
    return json(serializeProfile(saved));
  });
}
