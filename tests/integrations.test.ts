import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  integrationsDefaults,
  mergeParchmentSettings,
  parchmentPatchSchema,
  parchmentStatus,
  readParchmentSettings,
} from "@/lib/integrations";
import { interleave } from "@/lib/retrieval";
import { parchmentAgentId, parchmentOrgId } from "@/lib/parchment";

const ENV_KEYS = [
  "PARCHMENT_API_URL",
  "PARCHMENT_INTERNAL_AGENT_KEY",
  "PARCHMENT_AGENT_ID",
  "PARCHMENT_ORG_ID",
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
  vi.restoreAllMocks();
});

function configured() {
  process.env.PARCHMENT_API_URL = "https://parchment.example.com";
  process.env.PARCHMENT_INTERNAL_AGENT_KEY = "secret";
}

describe("parchment settings", () => {
  it("defaults to enabled — access is opt-out, not opt-in", () => {
    expect(integrationsDefaults().parchment).toEqual({
      enabled: true,
      workspaceId: null,
      orgId: null,
    });
  });

  it("repairs malformed stored config instead of throwing", () => {
    expect(readParchmentSettings({ parchment: { enabled: "yes" } })).toEqual({
      enabled: true,
      workspaceId: null,
      orgId: null,
    });
    expect(readParchmentSettings(null).enabled).toBe(true);
    expect(readParchmentSettings({}).enabled).toBe(true);
  });

  it("preserves untouched keys when merging a patch", () => {
    const stored = { parchment: { enabled: true, workspaceId: "ws-1", orgId: "org_a" } };
    expect(mergeParchmentSettings(stored, { enabled: false }).parchment).toEqual({
      enabled: false,
      workspaceId: "ws-1",
      orgId: "org_a",
    });
  });

  it("rejects unknown fields and wrong types on PATCH", () => {
    expect(parchmentPatchSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(parchmentPatchSchema.safeParse({ workspaceId: null }).success).toBe(true);
    expect(parchmentPatchSchema.safeParse({ enabled: "no" }).success).toBe(false);
    expect(parchmentPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
    // Empty string is not a workspace id — null means "use the org default".
    expect(parchmentPatchSchema.safeParse({ workspaceId: "" }).success).toBe(false);
  });
});

describe("availability vs enablement", () => {
  it("is inactive when the server has no credentials, however the toggle reads", () => {
    const status = parchmentStatus({ parchment: { enabled: true } }, "default");
    expect(status.available).toBe(false);
    expect(status.enabled).toBe(true);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toMatch(/PARCHMENT_API_URL/);
  });

  it("is active only when configured and enabled", () => {
    configured();
    expect(parchmentStatus({ parchment: { enabled: true } }, "default").active).toBe(true);
    expect(parchmentStatus({ parchment: { enabled: false } }, "default").active).toBe(false);
  });

  it("never serializes the internal key", () => {
    configured();
    const serialized = JSON.stringify(parchmentStatus({ parchment: { enabled: true } }, "default"));
    expect(serialized).not.toContain("secret");
    expect(serialized).toContain("parchment.example.com");
  });
});

describe("org and agent identification", () => {
  it("prefers the per-worker override, then env, then the local org id", () => {
    expect(parchmentOrgId("default", "org_override")).toBe("org_override");
    process.env.PARCHMENT_ORG_ID = "org_env";
    expect(parchmentOrgId("default", null)).toBe("org_env");
    delete process.env.PARCHMENT_ORG_ID;
    expect(parchmentOrgId("default", null)).toBe("default");
    // Blank override is not a value.
    expect(parchmentOrgId("default", "   ")).toBe("default");
  });

  it("falls back to the worker slug for the attribution label", () => {
    expect(parchmentAgentId("support-bot")).toBe("support-bot");
    process.env.PARCHMENT_AGENT_ID = "nick";
    expect(parchmentAgentId("support-bot")).toBe("nick");
  });
});

describe("interleave", () => {
  const match = (id: string, rank: number) => ({
    documentId: id,
    title: id,
    heading: null,
    content: id,
    rank,
  });

  it("round-robins both sources so neither crowds the other out", () => {
    // Parchment scores and ts_rank are different scales; a naive sort by rank
    // would drop one source entirely.
    const local = [match("l1", 0.01), match("l2", 0.009)];
    const remote = [match("p1", 0.9), match("p2", 0.8)];
    expect(interleave(local, remote, 4).map((m) => m.documentId)).toEqual(["l1", "p1", "l2", "p2"]);
  });

  it("respects the limit and handles an empty source", () => {
    const local = [match("l1", 1), match("l2", 1), match("l3", 1)];
    expect(interleave(local, [], 2).map((m) => m.documentId)).toEqual(["l1", "l2"]);
    expect(interleave([], local, 2).map((m) => m.documentId)).toEqual(["l1", "l2"]);
    expect(interleave([], [], 5)).toEqual([]);
  });
});
