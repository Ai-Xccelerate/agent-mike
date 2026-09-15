import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizations, workerProfiles } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";

describe("getOrCreateProfile", () => {
  it("still gives a new org a profile when the default slug is already taken", async () => {
    const collisionOrgId = `org-${randomUUID()}`;
    const orgId = `org-${randomUUID()}`;

    // Force the schema's default slug ("worker") to already be taken by some
    // other org, regardless of whatever this DB already had, so the test
    // doesn't depend on prior state.
    await db.insert(organizations).values({ id: collisionOrgId, name: collisionOrgId });
    await db
      .insert(workerProfiles)
      .values({ organizationId: collisionOrgId, slug: "worker" })
      .onConflictDoNothing();

    const profile = await getOrCreateProfile(orgId);
    expect(profile.organizationId).toBe(orgId);
    expect(profile.slug).not.toBe("worker");
    expect(profile.slug).toMatch(/^worker-/);

    // idempotent: calling again for the same org returns the same row, not a new one.
    const again = await getOrCreateProfile(orgId);
    expect(again.id).toBe(profile.id);

    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, orgId));
    await db.delete(workerProfiles).where(eq(workerProfiles.organizationId, collisionOrgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, collisionOrgId));
  });
});
