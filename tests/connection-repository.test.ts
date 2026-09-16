import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationConnections } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  attachConnectedAccountId,
  getConnectionForOrg,
  markConnectionActive,
  markConnectionFailed,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";

describe("connection repository", () => {
  it("upserts pending, switches vendor in place, then marks active", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Connection test org");

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });

    const fetched = await getConnectionForOrg(orgId, "crm");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(pending.id);
    expect(fetched!.status).toBe("pending");
    expect(fetched!.system).toBe("zoho");
    expect(fetched!.composioConnectedAccountId).toBeNull();

    const attached = await attachConnectedAccountId(pending.id, "ca_pending_123");
    expect(attached.status).toBe("pending");
    expect(attached.composioConnectedAccountId).toBe("ca_pending_123");

    const switched = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "hubspot",
      composioAuthConfigId: "ac_hubspot",
      connectedBy: "manager-1",
    });

    expect(switched.id).toBe(pending.id);
    expect(switched.system).toBe("hubspot");
    expect(switched.composioAuthConfigId).toBe("ac_hubspot");
    expect(switched.status).toBe("pending");

    const rows = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, orgId));
    expect(rows).toHaveLength(1);

    const active = await markConnectionActive(switched.id, "ca_hubspot_123");
    expect(active.status).toBe("active");
    expect(active.composioConnectedAccountId).toBe("ca_hubspot_123");

    const afterActive = await getConnectionForOrg(orgId, "crm");
    expect(afterActive!.status).toBe("active");
    expect(afterActive!.composioConnectedAccountId).toBe("ca_hubspot_123");
    expect(afterActive!.id).toBe(pending.id);

    await db.delete(integrationConnections).where(eq(integrationConnections.id, pending.id));
  });

  it("marks a dead OAuth attempt failed instead of leaving it pending forever", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Connection failure test org");

    const pending = await upsertPendingConnection({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      composioAuthConfigId: "ac_zoho",
      connectedBy: "manager-1",
    });
    await attachConnectedAccountId(pending.id, "ca_expired_123");

    const failed = await markConnectionFailed(pending.id);
    expect(failed.status).toBe("failed");
    expect(failed.composioConnectedAccountId).toBe("ca_expired_123");

    const fetched = await getConnectionForOrg(orgId, "crm");
    expect(fetched!.status).toBe("failed");

    await db.delete(integrationConnections).where(eq(integrationConnections.id, pending.id));
  });
});
