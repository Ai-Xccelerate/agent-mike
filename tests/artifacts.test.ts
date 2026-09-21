import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACTS_KEY,
  artifactsDefaults,
  artifactsPatchSchema,
  artifactsStatus,
  integrationStatuses,
  integrationsDefaults,
  mergeArtifactsSettings,
  readAgentDbSettings,
  readArtifactsSettings,
  readParchmentSettings,
  readScribeSettings,
} from "@/lib/integrations";
import { PUBLISHING_TOOLS, WRITING_TOOLS, artifactsOrgLabel, isArtifactsConfigured } from "@/lib/artifacts";

const ENV_KEYS = ["ARTIFACTS_MCP_URL", "ARTIFACTS_MCP_TOKEN", "ARTIFACTS_ORG_ID"] as const;

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
  process.env.ARTIFACTS_MCP_URL = "https://artifacts.example.com/mcp";
  process.env.ARTIFACTS_MCP_TOKEN = "aix_mcp_supersecret";
}

describe("artifacts settings", () => {
  it("defaults to off, and to draft-only — it is the one integration that writes", () => {
    expect(integrationsDefaults()[ARTIFACTS_KEY]).toEqual({
      enabled: false,
      brandKitId: null,
      allowPublish: false,
    });
    expect(artifactsDefaults().allowPublish).toBe(false);
  });

  it("fills itself in for rows written before it existed, leaving the others alone", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: null, orgId: "org_a" },
      scribe: { enabled: true, lookbackDays: 90 },
    };
    expect(readArtifactsSettings(stored)).toEqual(artifactsDefaults());
    expect(readParchmentSettings(stored).workspaceId).toBe("p1");
    expect(readAgentDbSettings(stored).orgId).toBe("org_a");
    expect(readScribeSettings(stored).lookbackDays).toBe(90);
  });

  it("merges a patch without disturbing the other three integrations", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: "w1", orgId: null },
      scribe: { enabled: true, lookbackDays: 30 },
    };
    const merged = mergeArtifactsSettings(stored, { enabled: true, brandKitId: "kit-1" });
    expect(merged.artifacts).toEqual({ enabled: true, brandKitId: "kit-1", allowPublish: false });
    expect(merged.parchment.workspaceId).toBe("p1");
    expect(merged.agentdb.workspaceId).toBe("w1");
    expect(merged.scribe.lookbackDays).toBe(30);
  });

  it("rejects unknown keys and empty brand kit ids", () => {
    expect(artifactsPatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(artifactsPatchSchema.safeParse({ allowPublish: true }).success).toBe(true);
    expect(artifactsPatchSchema.safeParse({ brandKitId: null }).success).toBe(true);
    expect(artifactsPatchSchema.safeParse({ brandKitId: "" }).success).toBe(false);
    expect(artifactsPatchSchema.safeParse({ allowPublish: "yes" }).success).toBe(false);
    expect(artifactsPatchSchema.safeParse({ token: "x" }).success).toBe(false);
  });
});

describe("artifacts status", () => {
  it("is unavailable, and therefore inactive, without server credentials", () => {
    expect(isArtifactsConfigured()).toBe(false);
    const status = artifactsStatus({ artifacts: { enabled: true } });
    expect(status.available).toBe(false);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toContain("ARTIFACTS_MCP_URL");
  });

  it("is active only when the server is configured and the toggle is on", () => {
    configured();
    expect(artifactsStatus({ artifacts: { enabled: false } }).active).toBe(false);
    expect(artifactsStatus({ artifacts: { enabled: true } }).active).toBe(true);
  });

  it("never serializes the workspace token", () => {
    configured();
    const status = artifactsStatus({ artifacts: { enabled: true } });
    expect(JSON.stringify(status)).not.toContain("aix_mcp_supersecret");
    expect(status.settings.api_url).toBe("https://artifacts.example.com/mcp");
  });

  it("surfaces the workspace label only when it is configured", () => {
    configured();
    expect(artifactsStatus({}).settings.workspace).toBeNull();
    process.env.ARTIFACTS_ORG_ID = "org_abc";
    expect(artifactsOrgLabel()).toBe("org_abc");
    expect(artifactsStatus({}).settings.workspace).toBe("org_abc");
  });

  it("is listed alongside the other integrations", async () => {
    expect((await integrationStatuses({}, "default")).map((s) => s.key)).toEqual([
      "parchment",
      "agentdb",
      "scribe",
      "artifacts",
      "agent_wiki",
      "agent_skills",
    ]);
  });
});

describe("tool classification", () => {
  it("treats every state-changing tool as a write", () => {
    for (const name of ["create_artifact", "update_artifact", "publish_artifact", "export_artifact", "deliver_artifact"]) {
      expect(WRITING_TOOLS).toContain(name);
    }
  });

  it("does not classify read-only tools as writes", () => {
    for (const name of ["list_artifacts", "list_brand_kits", "show_artifact", "get_task", "get_artifact_analytics", "list_connected_apps"]) {
      expect(WRITING_TOOLS).not.toContain(name);
    }
  });

  it("treats reaching outside the workspace as publishing", () => {
    expect(PUBLISHING_TOOLS).toContain("publish_artifact");
    expect(PUBLISHING_TOOLS).toContain("deliver_artifact");
    expect(PUBLISHING_TOOLS).not.toContain("create_artifact");
  });
});
