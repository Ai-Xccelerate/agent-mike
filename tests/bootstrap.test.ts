import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";

describe("getOrCreateProfile", () => {
  it("survives concurrent first requests for a brand-new org", async () => {
    // The console fires several requests at once on a company's first visit;
    // a select-then-insert let them race and the losers failed on
    // organizations_pkey / worker_profiles_org_unique.
    const orgId = `org_${randomUUID().replace(/-/g, "")}`;
    const profiles = await Promise.all(Array.from({ length: 8 }, () => getOrCreateProfile(orgId)));

    expect(new Set(profiles.map((p) => p.id)).size).toBe(1);
    const rows = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, orgId));
    expect(rows).toHaveLength(1);

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("lets two different orgs share the default slug, since uniqueness is per-org", async () => {
    // orgId is deliberately too long to pass slugSchema (> 32 chars), so it
    // isn't seeded as the slug and both orgs fall back to the schema default
    // ("worker") — that must not collide now that slug is unique per
    // (organizationId, slug) rather than globally (db/schema.ts orgSlugUnique).
    const collisionOrgId = `org-${randomUUID()}`;
    const orgId = `org-${randomUUID()}`;

    await db.insert(organizations).values({ id: collisionOrgId, name: collisionOrgId });
    await db
      .insert(workerProfiles)
      .values({ organizationId: collisionOrgId, slug: "worker" })
      .onConflictDoNothing();

    const profile = await getOrCreateProfile(orgId);
    expect(profile.organizationId).toBe(orgId);
    expect(profile.slug).toBe("worker");

    // idempotent: calling again for the same org returns the same row, not a new one.
    const again = await getOrCreateProfile(orgId);
    expect(again.id).toBe(profile.id);

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, orgId));
    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, collisionOrgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, collisionOrgId));
  });

  it("seeds slug and displayName from a slug-shaped org id, but not a reserved word", async () => {
    const goodOrgId = `george-${randomUUID().slice(0, 8)}`;
    const reservedOrgId = "settings";

    const good = await getOrCreateProfile(goodOrgId);
    expect(good.slug).toBe(goodOrgId);

    const reserved = await getOrCreateProfile(reservedOrgId);
    // "settings" is on the reserved-word list (lib/identity-fields.ts) — must
    // not be seeded as a slug, or the manager's own PATCH /worker validation
    // would reject it the moment they edited any other identity field.
    expect(reserved.slug).not.toBe("settings");
    expect(reserved.slug).toBe("worker");
    // Not slug-shaped, so it isn't title-cased into a name: it gets this
    // deployment's own name instead (f13a937; a Clerk org id is the real case).
    expect(reserved.displayName).toBe("Mike");

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, goodOrgId));
    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, reservedOrgId));
    await db.delete(organizations).where(eq(organizations.id, goodOrgId));
    await db.delete(organizations).where(eq(organizations.id, reservedOrgId));
  });
});
