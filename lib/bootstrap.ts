import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME } from "@/lib/env";

export async function ensureOrganization(orgId: string, name = orgId) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ id: orgId, name }).returning();
  return created;
}

export async function getOrCreateProfile(orgId: string) {
  await ensureOrganization(orgId, orgId === DEFAULT_ORG_ID ? DEFAULT_ORG_NAME : orgId);

  const [existing] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.organizationId, orgId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db.insert(workerProfiles).values({ organizationId: orgId }).returning();
  return created;
}
