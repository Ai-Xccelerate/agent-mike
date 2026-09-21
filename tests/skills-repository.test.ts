import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_SKILLS_KEY,
  agentSkillsDefaults,
  agentSkillsPatchSchema,
  agentSkillsStatus,
  integrationsDefaults,
  mergeAgentSkillsSettings,
  readAgentSkillsSettings,
  readAgentWikiSettings,
  readScribeSettings,
} from "@/lib/integrations";
import {
  REPO_ID_PREFIX,
  envSkillsCredentials,
  isCompleteSkillsCredentials,
  isRepositorySkillId,
  normalizeSkillsCredentials,
  repositorySlugFrom,
  toRepositorySkillId,
} from "@/lib/skills-repository";

const ENV_KEYS = ["AIX_SKILLS_MCP_URL", "AIX_SKILLS_API_KEY"] as const;

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
  process.env.AIX_SKILLS_MCP_URL = "https://skills.example.com/mcp";
  process.env.AIX_SKILLS_API_KEY = "aix_skills_supersecret";
}

describe("skill repository credentials", () => {
  it("is incomplete until a key is present — the URL alone is not enough", () => {
    expect(isCompleteSkillsCredentials({})).toBe(false);
    expect(isCompleteSkillsCredentials({ apiUrl: "https://skills.example.com/mcp" })).toBe(false);
    expect(
      isCompleteSkillsCredentials({ apiUrl: "https://skills.example.com/mcp", apiKey: "k" }),
    ).toBe(true);
  });

  it("reads the fleet key from env, and defaults the URL", () => {
    // The URL has a sensible default, so only the key decides completeness.
    expect(isCompleteSkillsCredentials(envSkillsCredentials())).toBe(false);
    configured();
    const env = envSkillsCredentials();
    expect(env.apiKey).toBe("aix_skills_supersecret");
    expect(isCompleteSkillsCredentials(env)).toBe(true);
  });

  it("strips a trailing slash so the URL is joined consistently", () => {
    expect(
      normalizeSkillsCredentials({ apiUrl: "https://skills.example.com/mcp/", apiKey: "k" }).apiUrl,
    ).toBe("https://skills.example.com/mcp");
  });
});

describe("repository skill ids", () => {
  it("namespaces them, so they cannot collide with catalog or custom ids", () => {
    const id = toRepositorySkillId("code-review");
    expect(id).toBe(`${REPO_ID_PREFIX}code-review`);
    expect(isRepositorySkillId(id)).toBe(true);
    expect(repositorySlugFrom(id)).toBe("code-review");
  });

  it("does not mistake a catalog id or a custom UUID for a repository one", () => {
    expect(isRepositorySkillId("code-review")).toBe(false);
    expect(isRepositorySkillId("3f7dac13-872c-487a-8865-43d8d4fed268")).toBe(false);
  });

  it("leaves a bare slug alone, so a round trip is safe either way", () => {
    expect(repositorySlugFrom("code-review")).toBe("code-review");
  });
});

describe("skill repository settings", () => {
  it("defaults to off — every search is logged upstream against the key", () => {
    expect(integrationsDefaults()[AGENT_SKILLS_KEY]).toEqual({
      enabled: false,
      category: null,
      maxResults: 5,
    });
    expect(agentSkillsDefaults().enabled).toBe(false);
  });

  it("fills itself in for rows written before it existed, leaving the others alone", () => {
    const stored = {
      scribe: { enabled: true, lookbackDays: 90 },
      agent_wiki: { enabled: true, spaceId: "space-1", allowWrite: true },
    };
    expect(readAgentSkillsSettings(stored)).toEqual(agentSkillsDefaults());
    expect(readScribeSettings(stored).lookbackDays).toBe(90);
    expect(readAgentWikiSettings(stored).spaceId).toBe("space-1");
  });

  it("merges a patch without disturbing the other integrations", () => {
    const stored = {
      scribe: { enabled: true, lookbackDays: 30 },
      agent_wiki: { enabled: true, spaceId: "space-1", allowWrite: false },
    };
    const merged = mergeAgentSkillsSettings(stored, { enabled: true, category: "engineering" });
    expect(merged.agent_skills).toEqual({
      enabled: true,
      category: "engineering",
      maxResults: 5,
    });
    expect(merged.scribe.lookbackDays).toBe(30);
    expect(merged.agent_wiki.spaceId).toBe("space-1");
  });

  it("falls back to defaults for a corrupt slice rather than failing the screen", () => {
    expect(readAgentSkillsSettings({ agent_skills: "nonsense" })).toEqual(agentSkillsDefaults());
    expect(readAgentSkillsSettings({ agent_skills: { enabled: "yes" } })).toEqual(
      agentSkillsDefaults(),
    );
    expect(readAgentSkillsSettings(null)).toEqual(agentSkillsDefaults());
  });

  it("bounds maxResults, so one search cannot flood the context window", () => {
    expect(agentSkillsPatchSchema.safeParse({ maxResults: 5 }).success).toBe(true);
    expect(agentSkillsPatchSchema.safeParse({ maxResults: 0 }).success).toBe(false);
    expect(agentSkillsPatchSchema.safeParse({ maxResults: 50 }).success).toBe(false);
    expect(agentSkillsPatchSchema.safeParse({ maxResults: 2.5 }).success).toBe(false);
  });

  it("rejects unknown keys and accepts partial patches", () => {
    expect(agentSkillsPatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(agentSkillsPatchSchema.safeParse({ category: null }).success).toBe(true);
    expect(agentSkillsPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(agentSkillsPatchSchema.safeParse({ category: "" }).success).toBe(false);
  });
});

describe("skill repository status", () => {
  it("is unavailable without credentials, and says how to fix it", async () => {
    const status = await agentSkillsStatus({}, "status-test-org");
    expect(status.available).toBe(false);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toMatch(/Add a key for this agent/);
    expect(status.unavailableReason).toMatch(/AIX_SKILLS_API_KEY/);
  });

  it("is available but inactive until the worker switches it on", async () => {
    configured();
    expect((await agentSkillsStatus({}, "status-test-org")).available).toBe(true);
    expect((await agentSkillsStatus({}, "status-test-org")).active).toBe(false);

    const on = { agent_skills: { enabled: true, category: null, maxResults: 5 } };
    expect((await agentSkillsStatus(on, "status-test-org")).active).toBe(true);
  });

  it("never serializes the key", async () => {
    configured();
    const status = await agentSkillsStatus({}, "status-test-org");
    expect(JSON.stringify(status)).not.toContain("aix_skills_supersecret");
    expect(status.settings.api_url).toBe("https://skills.example.com/mcp");
  });
});
