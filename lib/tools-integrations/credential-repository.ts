import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationCredentials } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/tools-integrations/crypto";

export type IntegrationCredential = typeof integrationCredentials.$inferSelect;

export type CreateIntegrationCredentialInput = {
  organizationId: string;
  integrationType: string;
  system: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  connectedBy?: string | null;
};

function decryptRow(row: IntegrationCredential): IntegrationCredential {
  return {
    ...row,
    accessToken: decrypt(row.accessToken),
    refreshToken: row.refreshToken == null ? null : decrypt(row.refreshToken),
  };
}

export async function createIntegrationCredential(
  input: CreateIntegrationCredentialInput,
): Promise<IntegrationCredential> {
  const [row] = await db
    .insert(integrationCredentials)
    .values({
      organizationId: input.organizationId,
      integrationType: input.integrationType,
      system: input.system,
      accessToken: encrypt(input.accessToken),
      refreshToken: input.refreshToken == null ? null : encrypt(input.refreshToken),
      expiresAt: input.expiresAt ?? null,
      scopes: input.scopes ?? [],
      metadata: input.metadata ?? {},
      connectedBy: input.connectedBy ?? null,
    })
    .returning();
  return decryptRow(row);
}

export async function getIntegrationCredential(id: string): Promise<IntegrationCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.id, id))
    .limit(1);
  if (!row) return null;
  return decryptRow(row);
}

export async function getIntegrationCredentialForOrg(
  organizationId: string,
  integrationType: string,
  system: string,
): Promise<IntegrationCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, organizationId),
        eq(integrationCredentials.integrationType, integrationType),
        eq(integrationCredentials.system, system),
      ),
    )
    .orderBy(desc(integrationCredentials.createdAt))
    .limit(1);
  if (!row) return null;
  return decryptRow(row);
}
