import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationConnections } from "@/db/schema";

export type IntegrationConnection = typeof integrationConnections.$inferSelect;

export type UpsertPendingConnectionInput = {
  organizationId: string;
  integrationType: string;
  system: string;
  composioAuthConfigId: string;
  connectedBy?: string | null;
};

export async function upsertPendingConnection(
  input: UpsertPendingConnectionInput,
): Promise<IntegrationConnection> {
  const [row] = await db
    .insert(integrationConnections)
    .values({
      organizationId: input.organizationId,
      integrationType: input.integrationType,
      system: input.system,
      composioAuthConfigId: input.composioAuthConfigId,
      connectedBy: input.connectedBy ?? null,
      status: "pending",
      composioConnectedAccountId: null,
    })
    .onConflictDoUpdate({
      target: [integrationConnections.organizationId, integrationConnections.integrationType],
      set: {
        system: input.system,
        composioAuthConfigId: input.composioAuthConfigId,
        connectedBy: input.connectedBy ?? null,
        status: "pending",
        composioConnectedAccountId: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function markConnectionActive(
  id: string,
  composioConnectedAccountId: string,
): Promise<IntegrationConnection> {
  const [row] = await db
    .update(integrationConnections)
    .set({
      composioConnectedAccountId,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, id))
    .returning();
  return row;
}

export async function getConnectionForOrg(
  organizationId: string,
  integrationType: string,
): Promise<IntegrationConnection | null> {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.integrationType, integrationType),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteConnection(id: string): Promise<void> {
  await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
}
