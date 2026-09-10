import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationCredentials } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  createIntegrationCredential,
  getIntegrationCredential,
} from "@/lib/tools-integrations/credential-repository";

describe("credential repository encryption", () => {
  it("round-trips plaintext and stores ciphertext at rest", async () => {
    const plaintext = "super-secret-access-token";
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Credential test org");

    const created = await createIntegrationCredential({
      organizationId: orgId,
      integrationType: "crm",
      system: "zoho",
      accessToken: plaintext,
      refreshToken: "refresh-secret",
    });

    const fetched = await getIntegrationCredential(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.accessToken).toBe(plaintext);
    expect(fetched!.refreshToken).toBe("refresh-secret");

    const [raw] = await db
      .select({ accessToken: integrationCredentials.accessToken })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.id, created.id))
      .limit(1);

    expect(raw.accessToken).not.toBe(plaintext);
    expect(raw.accessToken).not.toBe(fetched!.accessToken);

    await db.delete(integrationCredentials).where(eq(integrationCredentials.id, created.id));
  });
});
