import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SCRIBE_KEY,
  integrationStatuses,
  integrationsDefaults,
  mergeScribeSettings,
  readAgentDbSettings,
  readParchmentSettings,
  readScribeSettings,
  scribePatchSchema,
  scribeStatus,
} from "@/lib/integrations";
import { lookbackDateFrom, toKnowledgeMatches, type ScribeAnswer } from "@/lib/scribe";
import { interleaveAll } from "@/lib/retrieval";

const ENV_KEYS = ["SCRIBE_MCP_URL", "SCRIBE_MCP_TOKEN"] as const;

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
  process.env.SCRIBE_MCP_URL = "https://scribe.example.com/api/mcp";
  process.env.SCRIBE_MCP_TOKEN = "sk_scribe_org_secret";
}

describe("scribe settings", () => {
  it("defaults to disabled — meeting transcripts are internal", () => {
    expect(integrationsDefaults()[SCRIBE_KEY]).toEqual({ enabled: false, lookbackDays: null });
  });

  it("fills in Scribe for rows written before it existed, leaving the others alone", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: null, orgId: "org_a" },
    };
    expect(readScribeSettings(stored)).toEqual({ enabled: false, lookbackDays: null });
    expect(readParchmentSettings(stored).workspaceId).toBe("p1");
    expect(readAgentDbSettings(stored).orgId).toBe("org_a");
  });

  it("merges a patch without disturbing the other two integrations", () => {
    const stored = {
      parchment: { enabled: false, workspaceId: "p1", orgId: null },
      agentdb: { enabled: true, workspaceId: "w1", orgId: null },
    };
    const merged = mergeScribeSettings(stored, { enabled: true, lookbackDays: 90 });
    expect(merged.scribe).toEqual({ enabled: true, lookbackDays: 90 });
    expect(merged.parchment.workspaceId).toBe("p1");
    expect(merged.agentdb.workspaceId).toBe("w1");
  });

  it("validates the lookback window and rejects unknown keys", () => {
    expect(scribePatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(scribePatchSchema.safeParse({ lookbackDays: null }).success).toBe(true);
    expect(scribePatchSchema.safeParse({ lookbackDays: 90 }).success).toBe(true);
    expect(scribePatchSchema.safeParse({ lookbackDays: 0 }).success).toBe(false);
    expect(scribePatchSchema.safeParse({ lookbackDays: 1.5 }).success).toBe(false);
    expect(scribePatchSchema.safeParse({ lookbackDays: 99999 }).success).toBe(false);
    expect(scribePatchSchema.safeParse({ token: "x" }).success).toBe(false);
  });
});

describe("scribe status", () => {
  it("is unavailable, and therefore inactive, without server credentials", () => {
    const status = scribeStatus({ scribe: { enabled: true } });
    expect(status.available).toBe(false);
    expect(status.active).toBe(false);
    expect(status.unavailableReason).toContain("SCRIBE_MCP_URL");
  });

  it("is active only when the server is configured and the toggle is on", () => {
    configured();
    expect(scribeStatus({ scribe: { enabled: false } }).active).toBe(false);
    expect(scribeStatus({ scribe: { enabled: true } }).active).toBe(true);
  });

  it("never serializes the token", () => {
    configured();
    const status = scribeStatus({ scribe: { enabled: true } });
    expect(JSON.stringify(status)).not.toContain("sk_scribe_org_secret");
    expect(status.settings.api_url).toBe("https://scribe.example.com/api/mcp");
  });

  it("is listed alongside the other integrations", async () => {
    // The full, ordered list is asserted once, in artifacts.test.ts.
    expect((await integrationStatuses({}, "default")).map((s) => s.key)).toContain("scribe");
  });
});

describe("lookback window", () => {
  it("is omitted entirely when the whole corpus is allowed", () => {
    expect(lookbackDateFrom(null)).toBeUndefined();
    expect(lookbackDateFrom(0)).toBeUndefined();
  });

  it("becomes an ISO date bound N days back", () => {
    const from = lookbackDateFrom(30);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.now() - new Date(from!).getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(32);
  });
});

describe("scribe answer to knowledge matches", () => {
  const answer: ScribeAnswer = {
    question: "what did we decide about pricing?",
    answer: "Pricing configuration moves into system settings.",
    conversationId: "conv-1",
    citations: [
      {
        meetingId: "m1",
        meetingTitle: "Engineering - Daily Standup",
        meetingDate: "2026-08-28",
        timestamp: "[12:04]",
        quote: "[decision] Move pricing configuration into system settings.",
        speakerName: "Rahul",
      },
      {
        meetingId: "m2",
        meetingTitle: "Manual test",
        meetingDate: null,
        timestamp: null,
        quote: "   ",
        speakerName: null,
      },
    ],
  };

  it("leads with the synthesized answer, then each citation", () => {
    const matches = toKnowledgeMatches(answer, 5);
    expect(matches[0].documentId).toBe("scribe:answer");
    expect(matches[1].documentId).toBe("scribe:m1");
    expect(matches[1].title).toBe("Engineering - Daily Standup");
    expect(matches[1].heading).toBe("2026-08-28 [12:04]");
    expect(matches[1].content).toContain("Rahul:");
  });

  it("drops empty quotes and honours the limit", () => {
    expect(toKnowledgeMatches(answer, 5)).toHaveLength(2);
    expect(toKnowledgeMatches(answer, 1)).toHaveLength(1);
  });

  it("prefixes ids so a meeting is never mistaken for a local document", () => {
    for (const match of toKnowledgeMatches(answer, 5)) {
      expect(match.documentId.startsWith("scribe:")).toBe(true);
    }
  });
});

describe("interleaveAll", () => {
  const m = (id: string) => ({ documentId: id, title: id, heading: null, content: id, rank: 1 });

  it("round-robins three sources, preserving each list's order", () => {
    const merged = interleaveAll([[m("l1"), m("l2")], [m("p1")], [m("s1"), m("s2")]], 6);
    expect(merged.map((x) => x.documentId)).toEqual(["l1", "p1", "s1", "l2", "s2"]);
  });

  it("respects the limit and tolerates empty input", () => {
    expect(interleaveAll([[m("a"), m("b")], [m("c")]], 2).map((x) => x.documentId)).toEqual(["a", "c"]);
    expect(interleaveAll([], 5)).toEqual([]);
    expect(interleaveAll([[]], 5)).toEqual([]);
  });
});
