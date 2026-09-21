import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, providerCredentials } from "@/db/schema";
import {
  clearOrgCredentials,
  describeCredentials,
  getOrgCredentials,
  resolveCredentials,
  setOrgCredentials,
} from "@/lib/provider-credentials";

/**
 * The point of this module is that one agent can bring its own application
 * while the rest share the fleet's — and that a secret, once written, never
 * comes back out. Both are asserted against a real database.
 */
const ORG = "creds-test-org";
const OTHER = "creds-test-other";
const PROVIDER = "nylas";

type Creds = { clientId: string; apiKey: string; apiUri: string };

const FLEET: Creds = {
  clientId: "fleet-client",
  apiKey: "fleet-key",
  apiUri: "https://api.us.nylas.com",
};

const env = () => FLEET;
const complete = (v: Creds) => Boolean(v.clientId && v.apiKey);

let originalKey: string | undefined;

beforeEach(async () => {
  originalKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  for (const org of [ORG, OTHER]) {
    await db.insert(organizations).values({ id: org, name: org }).onConflictDoNothing();
    await db.delete(providerCredentials).where(eq(providerCredentials.organizationId, org));
  }
});

afterEach(async () => {
  for (const org of [ORG, OTHER]) {
    await db.delete(providerCredentials).where(eq(providerCredentials.organizationId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
});

async function giveOwnApp(org: string, clientId: string) {
  await setOrgCredentials({
    organizationId: org,
    provider: PROVIDER,
    secrets: { clientId, apiKey: `${clientId}-key`, apiUri: "https://api.eu.nylas.com" },
    updatedBy: "tester",
  });
}

describe("storing an agent's own credentials", () => {
  it("round-trips through encryption", async () => {
    await giveOwnApp(ORG, "george-client");
    expect(await getOrgCredentials<Creds>(ORG, PROVIDER)).toMatchObject({
      clientId: "george-client",
      apiKey: "george-client-key",
    });
  });

  it("writes ciphertext, not the secret", async () => {
    await giveOwnApp(ORG, "george-client");
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.organizationId, ORG));
    expect(row.secrets).not.toContain("george-client-key");
    expect(row.secrets).not.toContain("clientId");
  });

  it("replaces rather than duplicating when saved again", async () => {
    await giveOwnApp(ORG, "first");
    await giveOwnApp(ORG, "second");
    const rows = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.organizationId, ORG));
    expect(rows).toHaveLength(1);
    expect((await getOrgCredentials<Creds>(ORG, PROVIDER))?.clientId).toBe("second");
  });

  it("treats unreadable ciphertext as absent rather than throwing", async () => {
    await giveOwnApp(ORG, "george-client");
    // What a restored backup or a rotated key leaves behind: a row whose
    // ciphertext will not authenticate. It must not take the screen down.
    await db
      .update(providerCredentials)
      .set({ secrets: Buffer.alloc(64, 3).toString("base64") })
      .where(eq(providerCredentials.organizationId, ORG));
    expect(await getOrgCredentials<Creds>(ORG, PROVIDER)).toBeNull();
  });
});

describe("resolving which application an agent uses", () => {
  it("prefers the agent's own over the fleet's", async () => {
    await giveOwnApp(ORG, "george-client");
    const resolved = await resolveCredentials<Creds>(ORG, PROVIDER, env, complete);
    expect(resolved).toMatchObject({ source: "org" });
    expect(resolved?.values.clientId).toBe("george-client");
  });

  it("falls back to the fleet when the agent has none", async () => {
    const resolved = await resolveCredentials<Creds>(ORG, PROVIDER, env, complete);
    expect(resolved).toMatchObject({ source: "env" });
    expect(resolved?.values.clientId).toBe("fleet-client");
  });

  it("is null when neither exists, so nothing calls out half-configured", async () => {
    const resolved = await resolveCredentials<Creds>(
      ORG,
      PROVIDER,
      () => ({ clientId: "", apiKey: "", apiUri: "" }),
      complete,
    );
    expect(resolved).toBeNull();
  });

  it("keeps one agent's application out of another's", async () => {
    await giveOwnApp(ORG, "george-client");
    const other = await resolveCredentials<Creds>(OTHER, PROVIDER, env, complete);
    expect(other).toMatchObject({ source: "env" });
    expect(other?.values.clientId).toBe("fleet-client");
  });

  it("falls back to the fleet again once the agent's own are cleared", async () => {
    await giveOwnApp(ORG, "george-client");
    expect(await clearOrgCredentials(ORG, PROVIDER)).toBe(true);
    expect(await resolveCredentials<Creds>(ORG, PROVIDER, env, complete)).toMatchObject({
      source: "env",
    });
  });
});

describe("what the settings screen is told", () => {
  it("never includes a secret, even masked", async () => {
    await giveOwnApp(ORG, "george-client");
    const summary = await describeCredentials<Creds>(ORG, PROVIDER, ["clientId", "apiKey"], env);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("george-client-key");
    expect(serialized).not.toContain("fleet-key");
  });

  it("reports which fields are set and where they came from", async () => {
    const fleet = await describeCredentials<Creds>(ORG, PROVIDER, ["clientId", "apiKey"], env);
    expect(fleet).toMatchObject({ source: "env", present: ["clientId", "apiKey"], missing: [] });

    await giveOwnApp(ORG, "george-client");
    const own = await describeCredentials<Creds>(ORG, PROVIDER, ["clientId", "apiKey"], env);
    expect(own).toMatchObject({ source: "org", missing: [] });
    expect(own.updatedBy).toBe("tester");
  });

  it("reports nothing configured when neither the agent nor the fleet has any", async () => {
    const summary = await describeCredentials<Creds>(
      ORG,
      PROVIDER,
      ["clientId", "apiKey"],
      () => ({ clientId: "", apiKey: "", apiUri: "" }),
    );
    expect(summary).toMatchObject({ source: "none", present: [], missing: ["clientId", "apiKey"] });
  });
});
