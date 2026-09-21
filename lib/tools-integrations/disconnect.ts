import { deleteAccount } from "@/lib/tools-integrations/composio-client";
import { deleteConnection, getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";

/** Removes the local connection row; best-effort revoke on Composio if an account id exists. */
export async function disconnectIntegration(organizationId: string, type: string): Promise<boolean> {
  const row = await getConnectionForOrg(organizationId, type);
  if (!row) return false;

  if (row.composioConnectedAccountId) {
    try {
      await deleteAccount(row.composioConnectedAccountId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Composio deleteAccount failed for ${row.composioConnectedAccountId}; removing local row anyway: ${message}`,
      );
    }
  }

  await deleteConnection(row.id);
  return true;
}
