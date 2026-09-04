import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { nylasMailboxes } from "@/db/schema";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/tenant-sync";

export type NylasMailbox = typeof nylasMailboxes.$inferSelect;

function envBootstrap() {
  const grantId = (process.env.NYLAS_GRANT_ID || "").trim();
  const organizationId = (
    process.env.NYLAS_ORG_ID ||
    process.env.MIKE_WIDGET_ORG_ID ||
    process.env.MIKE_DEV_ORG_ID ||
    ""
  ).trim();
  const email = (process.env.NYLAS_EMAIL || "").trim().toLowerCase();
  return { grantId, organizationId, email };
}

/** Upsert the env-configured mailbox so staging can start without a separate admin UI. */
export async function ensureBootstrapMailbox(): Promise<NylasMailbox | null> {
  const { grantId, organizationId, email } = envBootstrap();
  if (!grantId || !organizationId) return null;

  await ensureOrganization(organizationId, "Nylas inbox");

  const [byGrant] = await db
    .select()
    .from(nylasMailboxes)
    .where(eq(nylasMailboxes.grantId, grantId))
    .limit(1);

  if (byGrant) {
    if (
      byGrant.organizationId === organizationId &&
      (!email || byGrant.email === email) &&
      byGrant.active
    ) {
      return byGrant;
    }
    const [updated] = await db
      .update(nylasMailboxes)
      .set({
        organizationId,
        email: email || byGrant.email,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(nylasMailboxes.id, byGrant.id))
      .returning();
    return updated;
  }

  const [byOrg] = await db
    .select()
    .from(nylasMailboxes)
    .where(eq(nylasMailboxes.organizationId, organizationId))
    .limit(1);

  if (byOrg) {
    const [updated] = await db
      .update(nylasMailboxes)
      .set({
        grantId,
        email: email || byOrg.email,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(nylasMailboxes.id, byOrg.id))
      .returning();
    return updated;
  }

  if (!email) {
    throw new Error("NYLAS_EMAIL is required when bootstrapping a mailbox from env");
  }

  const [created] = await db
    .insert(nylasMailboxes)
    .values({
      id: randomUUID(),
      organizationId,
      grantId,
      email,
      active: true,
    })
    .returning();
  return created;
}

export async function mailboxByGrantId(grantId: string): Promise<NylasMailbox | null> {
  const gid = grantId.trim();
  if (!gid) return null;
  await ensureBootstrapMailbox();
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
  await ensureBootstrapMailbox();
  const [row] = await db
    .select()
    .from(nylasMailboxes)
    .where(and(eq(nylasMailboxes.organizationId, orgId), eq(nylasMailboxes.active, true)))
    .limit(1);
  return row ?? null;
}
