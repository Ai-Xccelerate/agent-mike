import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizations, workerUsers } from "@/db/schema";
import { ClerkIdentityAdapter, ensureWorkerUser } from "@/lib/identity-clerk";
import { ensureOrganization } from "@/lib/bootstrap";
import { emailClaim } from "@/lib/clerk-core-auth";

describe("emailClaim", () => {
  it("normalizes a valid claim and ignores missing or malformed ones", () => {
    expect(emailClaim({ email: "  Pat@Example.com " })).toBe("pat@example.com");
    expect(emailClaim({})).toBeNull();
    expect(emailClaim({ email: "not-an-email" })).toBeNull();
    expect(emailClaim({ email: 42 })).toBeNull();
  });
});

function request(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Parameters<ClerkIdentityAdapter["resolveManagerRequest"]>[0];
}

async function cleanup(orgId: string) {
  await db.delete(workerUsers).where(eq(workerUsers.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe("ClerkIdentityAdapter", () => {
  const createdOrgIds: string[] = [];

  afterEach(async () => {
    while (createdOrgIds.length) {
      const orgId = createdOrgIds.pop();
      if (orgId) await cleanup(orgId);
    }
  });

  it("reads the middleware-verified headers, provisions the org and worker_users row, and returns the tenant", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    const tenant = await new ClerkIdentityAdapter().resolveManagerRequest(
      request({
        "x-aix-verified-org-id": orgId,
        "x-aix-verified-user-id": userId,
        "x-aix-verified-role": "admin",
      }),
    );

    expect(tenant).toEqual({ orgId, userId, role: "admin", source: "clerk" });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    expect(org).toBeTruthy();

    const [row] = await db
      .select()
      .from(workerUsers)
      .where(eq(workerUsers.clerkUserId, userId))
      .limit(1);
    expect(row?.organizationId).toBe(orgId);
    expect(row?.role).toBe("admin");
    expect(row?.email).toBe(`${userId}@clerk.local`);
  });

  it("is idempotent and updates the role in place rather than inserting a duplicate row", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    await ensureOrganization(orgId);
    const first = await ensureWorkerUser(orgId, userId, "member");
    const second = await ensureWorkerUser(orgId, userId, "owner");

    expect(second.id).toBe(first.id);
    expect(second.role).toBe("owner");

    const rows = await db.select().from(workerUsers).where(eq(workerUsers.clerkUserId, userId));
    expect(rows).toHaveLength(1);
  });

  it("stores the verified email header instead of a placeholder", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    await new ClerkIdentityAdapter().resolveManagerRequest(
      request({
        "x-aix-verified-org-id": orgId,
        "x-aix-verified-user-id": userId,
        "x-aix-verified-role": "member",
        "x-aix-verified-email": "pat@example.com",
      }),
    );

    const [row] = await db.select().from(workerUsers).where(eq(workerUsers.clerkUserId, userId)).limit(1);
    expect(row?.email).toBe("pat@example.com");
  });

  it("replaces an existing placeholder once the real email arrives", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    await ensureOrganization(orgId);
    const first = await ensureWorkerUser(orgId, userId, "member");
    expect(first.email).toBe(`${userId}@clerk.local`);
    const second = await ensureWorkerUser(orgId, userId, "member", "pat@example.com");

    expect(second.id).toBe(first.id);
    expect(second.email).toBe("pat@example.com");
  });

  it("links a hand-made row with the same real email instead of duplicating the person", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);
    await ensureOrganization(orgId);
    const [manual] = await db
      .insert(workerUsers)
      .values({ organizationId: orgId, email: "pat@example.com", role: "member" })
      .returning();

    const linked = await ensureWorkerUser(orgId, userId, "admin", "pat@example.com");

    expect(linked.id).toBe(manual.id);
    expect(linked.clerkUserId).toBe(userId);
    expect(linked.role).toBe("admin");
    const rows = await db.select().from(workerUsers).where(eq(workerUsers.organizationId, orgId));
    expect(rows).toHaveLength(1);
  });

  it("never takes over a row already linked to another Clerk user", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const first = `user_${randomUUID().slice(0, 8)}`;
    const second = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    await ensureOrganization(orgId);
    const owner = await ensureWorkerUser(orgId, first, "owner", "shared@example.com");
    const other = await ensureWorkerUser(orgId, second, "member", "shared@example.com");

    expect(other.id).not.toBe(owner.id);
    expect(other.email).toBe(`${second}@clerk.local`);
    const [unchanged] = await db.select().from(workerUsers).where(eq(workerUsers.id, owner.id));
    expect(unchanged.clerkUserId).toBe(first);
  });

  it("fails closed when the verified org or user header is missing", async () => {
    await expect(
      new ClerkIdentityAdapter().resolveManagerRequest(
        request({ "x-aix-verified-role": "owner" }),
      ),
    ).rejects.toThrow("Verified Clerk tenant context is missing");
  });

  it("falls back to the member role for a missing or unrecognized role header", async () => {
    const orgId = `clerk-org-${randomUUID().slice(0, 8)}`;
    const userId = `user_${randomUUID().slice(0, 8)}`;
    createdOrgIds.push(orgId);

    const tenant = await new ClerkIdentityAdapter().resolveManagerRequest(
      request({ "x-aix-verified-org-id": orgId, "x-aix-verified-user-id": userId }),
    );
    expect(tenant.role).toBe("member");
  });
});
