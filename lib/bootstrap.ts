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

  // Seed the slug and display name from the agent's own id rather than leaving
  // every agent in the fleet called "AI Worker" at slug "worker". Provisioning
  // is the only moment we know the agent's name for free, and a manager can
  // rename both from Settings > Identity afterwards.
  const [created] = await db
    .insert(workerProfiles)
    .values({
      organizationId: orgId,
      ...(orgId === DEFAULT_ORG_ID ? {} : { slug: orgId, displayName: titleCase(orgId) }),
    })
    .returning();
  return created;
}

/** "agent-george" -> "Agent George". Only used to seed a new agent's name. */
function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
