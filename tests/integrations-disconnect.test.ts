import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationConnections } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { deleteAccount } from "@/lib/tools-integrations/composio-client";
import {
  attachConnectedAccountId,
  getConnectionForOrg,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import { disconnectIntegration } from "@/lib/tools-integrations/disconnect";

vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>();
  return {
    ...actual,
    deleteAccount: vi.fn(),
  };
});

const deleteAccountMock = vi.mocked(deleteAccount);

describe("disconnectIntegration", () => {
  beforeEach(() => {
    deleteAccountMock.mockReset();
    deleteAccountMock.mockResolvedValue(undefined);
  });

  it("removes a pending connection so getConnectionForOrg returns null", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Disconnect test org");

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });

    expect(await getConnectionForOrg(orgId, "crm")).not.toBeNull();

    const disconnected = await disconnectIntegration(orgId, "crm");

    expect(disconnected).toBe(true);
    expect(await getConnectionForOrg(orgId, "crm")).toBeNull();
    expect(deleteAccountMock).not.toHaveBeenCalled();

    const leftover = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, pending.id));
    expect(leftover).toHaveLength(0);
  });

  it("still removes the local row when Composio deleteAccount fails", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Disconnect composio-fail org");

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });
    await attachConnectedAccountId(pending.id, "ca_will_fail");
    deleteAccountMock.mockRejectedValueOnce(new Error("account already gone"));

    const disconnected = await disconnectIntegration(orgId, "crm");

    expect(disconnected).toBe(true);
    expect(deleteAccountMock).toHaveBeenCalledWith("ca_will_fail");
    expect(await getConnectionForOrg(orgId, "crm")).toBeNull();
  });
});
