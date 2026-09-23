import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizations, workerUsers } from "@/db/schema";
import { ClerkIdentityAdapter, ensureWorkerUser } from "@/lib/identity-clerk";

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

    const first = await ensureWorkerUser(orgId, userId, "member");
    const second = await ensureWorkerUser(orgId, userId, "owner");

    expect(second.id).toBe(first.id);
    expect(second.role).toBe("owner");

    const rows = await db.select().from(workerUsers).where(eq(workerUsers.clerkUserId, userId));
    expect(rows).toHaveLength(1);
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
