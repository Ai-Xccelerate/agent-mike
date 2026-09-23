import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME } from "@/lib/env";
import { isUniqueViolation } from "@/lib/worker-patch";
import { slugSchema } from "@/lib/identity-fields";

export async function ensureOrganization(orgId: string, name = orgId) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ id: orgId, name }).returning();
  return created;
}

/**
 * The org's real display name (e.g. "Default Workspace"), not its id
 * (e.g. "default") — those look similar for the seeded default org, which is
 * how `runAgent`/`buildInstructions` ended up being passed the id in place of
 * this for every worker's prompt until this function existed.
 */
export async function getOrganizationName(orgId: string): Promise<string> {
  const org = await ensureOrganization(orgId, orgId === DEFAULT_ORG_ID ? DEFAULT_ORG_NAME : orgId);
  return org.name;
}

/**
 * Seed the slug and display name from the agent's own id rather than leaving
 * every agent in the fleet called "AI Worker" at slug "worker" — but only
 * when that id is itself slug-shaped. Multi-agent org ids come from a request
 * header (lib/identity.ts's normalize()), which is looser than slugSchema
 * (longer, no reserved-word check), so an id like "settings" or one over 32
 * chars falls back to the schema default rather than seeding an invalid slug
 * that the manager-facing PATCH /worker route would reject the moment they
 * next edit an unrelated field.
 *
 * `slug` is unique per org (not global), so a fresh org's first profile can
 * only collide on insert in a race between two concurrent requests bootstrapping
 * the same brand-new org — retry with a random suffix rather than failing outright.
 */
export async function getOrCreateProfile(orgId: string) {
  await ensureOrganization(orgId, orgId === DEFAULT_ORG_ID ? DEFAULT_ORG_NAME : orgId);

  const [existing] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.organizationId, orgId))
    .limit(1);
  if (existing) return existing;

  const seededSlug = slugSchema.safeParse(orgId).success ? orgId : undefined;
  // Only title-case the org id itself when it's slug-shaped (multi-agent
  // fleet org ids are, e.g. "agent-george" -> "Agent George"). A Clerk
  // organization id ("org_3DIjvbx...") never is, and title-casing it
  // produced a garbled customer-facing name straight from the opaque id
  // instead of a real one — fall back to this deployment's own name.
  const seededDisplayName = seededSlug ? titleCase(seededSlug) : "Mike";

  try {
    const [created] = await db
      .insert(workerProfiles)
      .values({
        organizationId: orgId,
        ...(orgId === DEFAULT_ORG_ID
          ? {}
          : { ...(seededSlug ? { slug: seededSlug } : {}), displayName: seededDisplayName }),
      })
      .returning();
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [created] = await db
      .insert(workerProfiles)
      .values({
        organizationId: orgId,
        slug: `worker-${randomUUID()}`,
        ...(orgId === DEFAULT_ORG_ID ? {} : { displayName: seededDisplayName }),
      })
      .returning();
    return created;
  }
}

/** "agent-george" -> "Agent George". Only used to seed a new agent's name. */
function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
