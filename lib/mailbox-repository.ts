import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { nylasMailboxes } from "@/db/schema";

export type Mailbox = typeof nylasMailboxes.$inferSelect;

/** The org's mailbox, or null if none has ever been connected. */
export async function getMailbox(orgId: string): Promise<Mailbox | null> {
  const [row] = await db
    .select()
    .from(nylasMailboxes)
    .where(eq(nylasMailboxes.organizationId, orgId))
    .limit(1);
  return row ?? null;
}

/** Resolve an inbound Nylas event to its owning tenant. */
export async function getMailboxByGrantId(grantId: string): Promise<Mailbox | null> {
  const normalized = grantId.trim();
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(nylasMailboxes)
    .where(eq(nylasMailboxes.grantId, normalized))
    .limit(1);
  return row ?? null;
}

/**
 * Records a freshly authorised grant.
 *
 * Upsert rather than insert: reconnecting is the normal way to fix a revoked
 * mailbox, and it must replace the dead grant in place rather than collide with
 * the unique index or leave two rows disagreeing about which one is live.
 */
export async function saveMailbox(input: {
  organizationId: string;
  grantId: string;
  email: string;
  provider: string | null;
  connectedBy: string | null;
}): Promise<Mailbox> {
  const now = new Date();
  const [row] = await db
    .insert(nylasMailboxes)
    .values({
      organizationId: input.organizationId,
      grantId: input.grantId,
      email: input.email,
      provider: input.provider,
      connectedBy: input.connectedBy,
      status: "connected",
      connectedAt: now,
      lastCheckedAt: now,
    })
    .onConflictDoUpdate({
      target: nylasMailboxes.organizationId,
      set: {
        grantId: input.grantId,
        email: input.email,
        provider: input.provider,
        connectedBy: input.connectedBy,
        status: "connected",
        connectedAt: now,
        lastCheckedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Marks a grant as needing re-authorisation, keeping the row for the UI. */
export async function markMailboxInvalid(id: string): Promise<Mailbox> {
  const now = new Date();
  const [row] = await db
    .update(nylasMailboxes)
    .set({ status: "invalid", lastCheckedAt: now, updatedAt: now })
    .where(eq(nylasMailboxes.id, id))
    .returning();
  return row;
}

export async function touchMailbox(id: string): Promise<void> {
  await db
    .update(nylasMailboxes)
    .set({ lastCheckedAt: new Date() })
    .where(eq(nylasMailboxes.id, id));
}

/** Disconnecting removes the row — there is nothing worth keeping once revoked. */
export async function deleteMailbox(orgId: string): Promise<Mailbox | null> {
  const [row] = await db
    .delete(nylasMailboxes)
    .where(eq(nylasMailboxes.organizationId, orgId))
    .returning();
  return row ?? null;
}
