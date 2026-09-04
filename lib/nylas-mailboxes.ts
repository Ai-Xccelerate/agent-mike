import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { nylasMailboxes } from "@/db/schema";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/tenant-sync";

export type NylasMailbox = typeof nylasMailboxes.$inferSelect;

export function serializeMailbox(row: NylasMailbox | null) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organizationId,
    email: row.email,
    active: row.active,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** App-wide Nylas grant from Railway / env — never collected in the UI. */
export function envNylasGrantId(): string {
  return (process.env.NYLAS_GRANT_ID || "").trim();
}

export function envNylasMailboxEmail(): string {
  return (process.env.NYLAS_MAILBOX_EMAIL || "").trim().toLowerCase();
}

export async function mailboxByGrantId(grantId: string): Promise<NylasMailbox | null> {
  const gid = grantId.trim();
  if (!gid) return null;
  const [row] = await db
    .select()
    .from(nylasMailboxes)
    .where(and(eq(nylasMailboxes.grantId, gid), eq(nylasMailboxes.active, true)))
    .limit(1);
  return row ?? null;
}

export async function mailboxByOrgId(organizationId: string): Promise<NylasMailbox | null> {
  const orgId = organizationId.trim();
  if (!orgId) return null;
  const [row] = await db
    .select()
    .from(nylasMailboxes)
    .where(and(eq(nylasMailboxes.organizationId, orgId), eq(nylasMailboxes.active, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Attach a Nylas grant to the authenticated org.
 * Org comes from the Clerk JWT — never from env.
 */
export async function upsertMailboxForOrg(
  organizationId: string,
  input: { grantId: string; email: string; active?: boolean },
): Promise<NylasMailbox> {
  const orgId = organizationId.trim();
  const grantId = input.grantId.trim();
  const email = input.email.trim().toLowerCase();
  if (!orgId) throw new Error("organization_id is required");
  if (!grantId) throw new Error("grant_id is required");
  if (!email || !email.includes("@")) throw new Error("email is required");

  await ensureOrganization(orgId, "Nylas inbox");

  const [taken] = await db
    .select()
    .from(nylasMailboxes)
    .where(eq(nylasMailboxes.grantId, grantId))
    .limit(1);
  if (taken && taken.organizationId !== orgId) {
    throw new Error("grant_id is already mapped to another organization");
  }

  const existing = await mailboxByOrgId(orgId);
  if (existing) {
    const [updated] = await db
      .update(nylasMailboxes)
      .set({
        grantId,
        email,
        active: input.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(nylasMailboxes.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(nylasMailboxes)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      grantId,
      email,
      active: input.active ?? true,
    })
    .returning();
  return created;
}
