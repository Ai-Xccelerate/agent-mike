import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME } from "@/lib/env";
import { slugSchema } from "@/lib/identity-fields";

// Insert-if-absent, then read. A select-then-insert let parallel requests for
// a brand-new org (the console fires several on first load, and Clerk orgs are
// created on first use) all insert, and the losers failed on organizations_pkey.
export async function ensureOrganization(orgId: string, name = orgId) {
  const [created] = await db.insert(organizations).values({ id: orgId, name }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return existing;
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

  // One profile per org and slug unique per org, so a conflict can only be a
  // concurrent request creating this same org's profile: skip, then read the
  // row that won (the old random-slug retry then failed on the org index).
  const [created] = await db
    .insert(workerProfiles)
    .values({
      organizationId: orgId,
      ...(orgId === DEFAULT_ORG_ID
        ? {}
        : { ...(seededSlug ? { slug: seededSlug } : {}), displayName: seededDisplayName }),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [winner] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.organizationId, orgId))
    .limit(1);
  return winner;
}

/** "agent-george" -> "Agent George". Only used to seed a new agent's name. */
function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
