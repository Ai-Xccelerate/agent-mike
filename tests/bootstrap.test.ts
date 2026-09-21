import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";

describe("getOrCreateProfile", () => {
  it("initializes the same Clerk org safely across concurrent first requests", async () => {
    const orgId = `org-${randomUUID()}`;
    const [first, second] = await Promise.all([
      ensureOrganization(orgId, "Concurrent org"),
      ensureOrganization(orgId, "Concurrent org"),
    ]);
    expect(first.id).toBe(orgId);
    expect(second.id).toBe(orgId);
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("lets two different Clerk orgs share Mike's slug, since uniqueness is per-org", async () => {
    const collisionOrgId = `org-${randomUUID()}`;
    const orgId = `org-${randomUUID()}`;

    await db.insert(organizations).values({ id: collisionOrgId, name: collisionOrgId });
    await db
      .insert(workerProfiles)
      .values({ organizationId: collisionOrgId, slug: "mike" })
      .onConflictDoNothing();

    const profile = await getOrCreateProfile(orgId);
    expect(profile.organizationId).toBe(orgId);
    expect(profile.slug).toBe("mike");
    expect(profile.displayName).toBe("Agent Mike");

    // idempotent: calling again for the same org returns the same row, not a new one.
    const again = await getOrCreateProfile(orgId);
    expect(again.id).toBe(profile.id);

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, orgId));
    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, collisionOrgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, collisionOrgId));
  });

  it("keeps the product identity fixed instead of deriving it from Clerk org ids", async () => {
    const goodOrgId = `george-${randomUUID().slice(0, 8)}`;
    const reservedOrgId = "settings";

    const good = await getOrCreateProfile(goodOrgId);
    expect(good.slug).toBe("mike");
    expect(good.displayName).toBe("Agent Mike");

    const reserved = await getOrCreateProfile(reservedOrgId);
    expect(reserved.slug).toBe("mike");
    expect(reserved.displayName).toBe("Agent Mike");

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, goodOrgId));
    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, reservedOrgId));
    await db.delete(organizations).where(eq(organizations.id, goodOrgId));
    await db.delete(organizations).where(eq(organizations.id, reservedOrgId));
  });
});
