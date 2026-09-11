import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationConnections } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  getConnectionForOrg,
  markConnectionActive,
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
});
