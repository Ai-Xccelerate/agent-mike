import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENTDB_KEY,
  agentDbPatchSchema,
  agentDbStatus,
  integrationStatuses,
  integrationsDefaults,
  mergeAgentDbSettings,
  readAgentDbSettings,
  readParchmentSettings,
} from "@/lib/integrations";
import { AgentDbError, agentDbAgentId, agentDbOrgId, assertReadOnlySql } from "@/lib/agentdb";

const ENV_KEYS = [
  "AGENTDB_API_URL",
  "AGENTDB_INTERNAL_AGENT_KEY",
  "AGENTDB_AGENT_ID",
  "AGENTDB_ORG_ID",
  "AGENTDB_ENABLE_JWT",
] as const;

let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

function configured() {
  process.env.AGENTDB_API_URL = "https://agentdb.example.com";
  process.env.AGENTDB_INTERNAL_AGENT_KEY = "secret";
}

describe("agentdb settings", () => {
  it("defaults to disabled — full SQL scope is opt-in, not opt-out", () => {
    expect(integrationsDefaults()[AGENTDB_KEY]).toEqual({
      enabled: false,
      workspaceId: null,
      orgId: null,
    });
  });

  it("falls back to defaults for junk stored JSON without losing Parchment", () => {
    const stored = { parchment: { enabled: false, workspaceId: null, orgId: null }, agentdb: "nope" };
    expect(readAgentDbSettings(stored).enabled).toBe(false);
    expect(readParchmentSettings(stored).enabled).toBe(false);
  });

  it("fills in AgentDB for rows written before it existed", () => {
    const stored = { parchment: { enabled: true, workspaceId: null, orgId: null } };
    expect(readAgentDbSettings(stored)).toEqual({ enabled: false, workspaceId: null, orgId: null });
  });

  it("merges a patch without disturbing the other integration", () => {
    const stored = { parchment: { enabled: false, workspaceId: "p1", orgId: null } };
    const merged = mergeAgentDbSettings(stored, { enabled: true, workspaceId: "w1" });
    expect(merged.agentdb).toEqual({ enabled: true, workspaceId: "w1", orgId: null });
    expect(merged.parchment).toEqual({ enabled: false, workspaceId: "p1", orgId: null });
  });

  it("rejects unknown keys and empty ids on PATCH", () => {
    expect(agentDbPatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(agentDbPatchSchema.safeParse({ workspaceId: null }).success).toBe(true);
    expect(agentDbPatchSchema.safeParse({ workspaceId: "" }).success).toBe(false);
    expect(agentDbPatchSchema.safeParse({ scope: "full" }).success).toBe(false);
  });
});

describe("agentdb status", () => {
  it("is unavailable, and therefore inactive, without server credentials", () => {
    const status = agentDbStatus({ agentdb: { enabled: true } }, "default");
    expect(status.available).toBe(false);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toContain("AGENTDB_API_URL");
  });

  it("is active only when the server is configured and the toggle is on", () => {
    configured();
    expect(agentDbStatus({ agentdb: { enabled: false } }, "default").active).toBe(false);
    expect(agentDbStatus({ agentdb: { enabled: true } }, "default").active).toBe(true);
  });

  it("never serializes the internal key", () => {
    configured();
    const status = agentDbStatus({ agentdb: { enabled: true } }, "default");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(status.settings.api_url).toBe("https://agentdb.example.com");
  });

  it("is listed alongside the other integrations on the Integrations screen", async () => {
    expect((await integrationStatuses({}, "default")).map((s) => s.key)).toContain("agentdb");
  });
});

describe("agentdb org and agent id resolution", () => {
  it("prefers the per-worker override, then env, then the local org id", () => {
    expect(agentDbOrgId("local", "org_override")).toBe("org_override");
    process.env.AGENTDB_ORG_ID = "org_env";
    expect(agentDbOrgId("local", null)).toBe("org_env");
    delete process.env.AGENTDB_ORG_ID;
    expect(agentDbOrgId("local", null)).toBe("local");
  });

  it("falls back to the worker's slug for X-Agent-Id", () => {
    expect(agentDbAgentId("support-worker")).toBe("support-worker");
    process.env.AGENTDB_AGENT_ID = "nick";
    expect(agentDbAgentId("support-worker")).toBe("nick");
  });
});

describe("read-only SQL guard", () => {
  it("allows a single SELECT or WITH, trimming the trailing semicolon", () => {
    expect(assertReadOnlySql("select 1;")).toBe("select 1");
    expect(assertReadOnlySql("  WITH x AS (SELECT 1) SELECT * FROM x  ")).toBe(
      "WITH x AS (SELECT 1) SELECT * FROM x",
    );
  });

  it("refuses writes and schema changes", () => {
    for (const sql of [
      "DROP TABLE customers",
      "delete from customers",
      "UPDATE customers SET name = 'x'",
      "INSERT INTO customers VALUES (1)",
      "TRUNCATE customers",
    ]) {
      expect(() => assertReadOnlySql(sql)).toThrowError(AgentDbError);
    }
  });

  it("refuses a second statement smuggled in after a SELECT", () => {
    expect(() => assertReadOnlySql("SELECT 1; DROP TABLE customers")).toThrowError(/single statement/i);
  });

  it("refuses a data-modifying CTE, which a prefix check alone would allow", () => {
    expect(() =>
      assertReadOnlySql("WITH d AS (DELETE FROM customers RETURNING *) SELECT * FROM d"),
    ).toThrowError(/only read/i);
  });

  it("refuses empty SQL", () => {
    expect(() => assertReadOnlySql("   ")).toThrowError(AgentDbError);
  });
});
