import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_WIKI_KEY,
  agentWikiDefaults,
  agentWikiPatchSchema,
  agentWikiStatus,
  integrationStatuses,
  integrationsDefaults,
  mergeAgentWikiSettings,
  readAgentDbSettings,
  readAgentWikiSettings,
  readArtifactsSettings,
  readParchmentSettings,
  readScribeSettings,
} from "@/lib/integrations";
import {
  agentWikiKeyLabel,
  agentWikiMcpUrl,
  isAgentWikiConfigured,
  resolveSearchTool,
  toKnowledgeMatches,
  toolWrites,
  type AgentWikiPage,
  type AgentWikiTool,
} from "@/lib/agent-wiki";

const ENV_KEYS = ["AGENT_WIKI_MCP_URL", "AGENT_WIKI_API_KEY", "AGENT_WIKI_KEY_LABEL"] as const;

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
  process.env.AGENT_WIKI_MCP_URL = "https://wiki.example.com/mcp/";
  process.env.AGENT_WIKI_API_KEY = "aw_key_supersecret";
}

function tool(name: string): AgentWikiTool {
  return { name, description: "", writes: toolWrites(name) };
}

describe("agent wiki settings", () => {
  it("defaults to off, and to read-only — it can change pages", () => {
    expect(integrationsDefaults()[AGENT_WIKI_KEY]).toEqual({
      enabled: false,
      spaceId: null,
      allowWrite: false,
    });
    expect(agentWikiDefaults().allowWrite).toBe(false);
  });

  it("fills itself in for rows written before it existed, leaving the others alone", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: null, orgId: "org_a" },
      scribe: { enabled: true, lookbackDays: 90 },
      artifacts: { enabled: true, brandKitId: "kit-1", allowPublish: true },
    };
    expect(readAgentWikiSettings(stored)).toEqual(agentWikiDefaults());
    expect(readParchmentSettings(stored).workspaceId).toBe("p1");
    expect(readAgentDbSettings(stored).orgId).toBe("org_a");
    expect(readScribeSettings(stored).lookbackDays).toBe(90);
    expect(readArtifactsSettings(stored).allowPublish).toBe(true);
  });

  it("merges a patch without disturbing the other four integrations", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: "w1", orgId: null },
      scribe: { enabled: true, lookbackDays: 30 },
      artifacts: { enabled: true, brandKitId: "kit-1", allowPublish: false },
    };
    const merged = mergeAgentWikiSettings(stored, { enabled: true, spaceId: "space-7" });
    expect(merged.agent_wiki).toEqual({ enabled: true, spaceId: "space-7", allowWrite: false });
    expect(merged.parchment.workspaceId).toBe("p1");
    expect(merged.agentdb.workspaceId).toBe("w1");
    expect(merged.scribe.lookbackDays).toBe(30);
    expect(merged.artifacts.brandKitId).toBe("kit-1");
  });

  it("falls back to defaults for a corrupt slice rather than failing the screen", () => {
    expect(readAgentWikiSettings({ agent_wiki: "nonsense" })).toEqual(agentWikiDefaults());
    expect(readAgentWikiSettings({ agent_wiki: { enabled: "yes" } })).toEqual(agentWikiDefaults());
    expect(readAgentWikiSettings(null)).toEqual(agentWikiDefaults());
  });

  it("rejects unknown keys and accepts partial patches", () => {
    expect(agentWikiPatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(agentWikiPatchSchema.safeParse({ spaceId: null }).success).toBe(true);
    expect(agentWikiPatchSchema.safeParse({ allowWrite: true }).success).toBe(true);
    expect(agentWikiPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(agentWikiPatchSchema.safeParse({ spaceId: "" }).success).toBe(false);
  });
});

describe("agent wiki configuration", () => {
  it("needs both halves of the credential before it is available", () => {
    expect(isAgentWikiConfigured()).toBe(false);
    process.env.AGENT_WIKI_MCP_URL = "https://wiki.example.com/mcp/";
    expect(isAgentWikiConfigured()).toBe(false);
    process.env.AGENT_WIKI_API_KEY = "aw_key_supersecret";
    expect(isAgentWikiConfigured()).toBe(true);
  });

  it("strips the trailing slash so the URL is joined consistently", () => {
    process.env.AGENT_WIKI_MCP_URL = "https://wiki.example.com/mcp/";
    expect(agentWikiMcpUrl()).toBe("https://wiki.example.com/mcp");
  });

  it("reports the key label only when set, and never the key", () => {
    expect(agentWikiKeyLabel()).toBeNull();
    process.env.AGENT_WIKI_KEY_LABEL = "AI Worker";
    expect(agentWikiKeyLabel()).toBe("AI Worker");
  });
});

describe("agent wiki status", () => {
  it("is unavailable without credentials, and says which vars are missing", () => {
    const status = agentWikiStatus({});
    expect(status.available).toBe(false);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toMatch(/AGENT_WIKI_MCP_URL/);
    expect(status.unavailableReason).toMatch(/AGENT_WIKI_API_KEY/);
  });

  it("is available but inactive until the worker switches it on", () => {
    configured();
    expect(agentWikiStatus({}).available).toBe(true);
    expect(agentWikiStatus({}).active).toBe(false);

    const on = { agent_wiki: { enabled: true, spaceId: null, allowWrite: false } };
    expect(agentWikiStatus(on).active).toBe(true);
  });

  it("never serializes the key", () => {
    configured();
    const serialized = JSON.stringify(agentWikiStatus({}));
    expect(serialized).not.toContain("aw_key_supersecret");
    expect(agentWikiStatus({}).settings.api_url).toBe("https://wiki.example.com/mcp");
  });

  it("joins the other integrations on the settings screen", async () => {
    const keys = (await integrationStatuses({}, "org-local")).map((s) => s.key);
    expect(keys).toContain(AGENT_WIKI_KEY);
    expect(keys).toHaveLength(6);
  });
});

describe("agent wiki tool classification", () => {
  it("treats anything that changes a page as a write", () => {
    for (const name of [
      "create_page",
      "update_page",
      "delete_page",
      "rename_page",
      "move_page",
      "append_to_page",
    ]) {
      expect(toolWrites(name)).toBe(true);
    }
  });

  it("leaves reading and searching alone", () => {
    for (const name of ["search_pages", "get_page", "list_spaces", "read_page"]) {
      expect(toolWrites(name)).toBe(false);
    }
  });

  it("picks the search tool out of whatever the server exposes", () => {
    expect(resolveSearchTool([tool("get_page"), tool("search_pages")])).toBe("search_pages");
    // Preference order, not discovery order.
    expect(resolveSearchTool([tool("search"), tool("search_pages")])).toBe("search_pages");
    // An unanticipated name still resolves, as long as it only reads.
    expect(resolveSearchTool([tool("get_page"), tool("lookup_query")])).toBe("lookup_query");
    expect(resolveSearchTool([tool("get_page"), tool("create_page")])).toBeNull();
    expect(resolveSearchTool([])).toBeNull();
  });
});

describe("agent wiki knowledge shaping", () => {
  const pages: AgentWikiPage[] = [
    {
      id: "p1",
      title: "Refund policy",
      spaceId: "s1",
      spaceName: "Support",
      url: "https://wiki/p1",
      excerpt: "Refunds are issued within 14 days.",
      updatedAt: "2026-01-02",
    },
    {
      id: "p2",
      title: "Empty",
      spaceId: "s1",
      spaceName: "Support",
      url: null,
      excerpt: "   ",
      updatedAt: null,
    },
    {
      id: "p3",
      title: "Escalation",
      spaceId: "s2",
      spaceName: "Ops",
      url: null,
      excerpt: "Escalate billing disputes to the manager.",
      updatedAt: null,
    },
  ];

  it("prefixes ids so a wiki page cannot be mistaken for a local document", () => {
    expect(toKnowledgeMatches(pages, 5).map((m) => m.documentId)).toEqual([
      "agent-wiki:p1",
      "agent-wiki:p3",
    ]);
  });

  it("drops empty pages and keeps the server's ordering", () => {
    const matches = toKnowledgeMatches(pages, 5);
    expect(matches).toHaveLength(2);
    expect(matches[0].title).toBe("Refund policy");
    expect(matches[0].rank).toBeGreaterThan(matches[1].rank);
    expect(matches[0].heading).toBe("Support");
  });

  it("honours the limit", () => {
    expect(toKnowledgeMatches(pages, 1)).toHaveLength(1);
    expect(toKnowledgeMatches([], 5)).toEqual([]);
  });
});
