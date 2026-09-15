import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME } from "@/lib/env";
import { isUniqueViolation } from "@/lib/worker-patch";

export async function ensureOrganization(orgId: string, name = orgId) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ id: orgId, name }).returning();
  return created;
}

/**
 * `slug` is globally unique (not scoped per org), and the schema's own
 * default is the literal string "worker" — fine for the very first org to
 * ever get a profile, but every org after that would collide on insert.
 * Try the friendly default first, then fall back to a suffixed slug rather
 * than failing multi-tenant setups outright; the manager can rename it from
 * Identity settings afterward either way.
 */
export async function getOrCreateProfile(orgId: string) {
  await ensureOrganization(orgId, orgId === DEFAULT_ORG_ID ? DEFAULT_ORG_NAME : orgId);

  const [existing] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.organizationId, orgId))
    .limit(1);
  if (existing) return existing;

  try {
    const [created] = await db.insert(workerProfiles).values({ organizationId: orgId }).returning();
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [created] = await db
      .insert(workerProfiles)
      .values({ organizationId: orgId, slug: `worker-${randomUUID()}` })
      .returning();
    return created;
  }
}
