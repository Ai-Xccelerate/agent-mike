import { beforeEach, describe, expect, it, vi } from "vitest";
import type { workerProfiles } from "@/db/schema";
import { buildAssistantTools } from "@/lib/assistant-agent";
import { buildAssistantReadTools, buildSituationBrief } from "@/lib/assistant-read-tools";
import { listCannedReplies } from "@/lib/canned-replies";
import { listEvalCases, enabledEvalCases } from "@/lib/eval-cases";
import { listEvalRuns } from "@/lib/eval-replay";
import { listManagers } from "@/lib/managers";
import { loadReviewItems } from "@/lib/review-queue";

vi.mock("@/lib/canned-replies", () => ({ listCannedReplies: vi.fn() }));
vi.mock("@/lib/eval-cases", () => ({ listEvalCases: vi.fn(), enabledEvalCases: vi.fn() }));
vi.mock("@/lib/eval-replay", () => ({ listEvalRuns: vi.fn(), startReplay: vi.fn() }));
vi.mock("@/lib/managers", () => ({ listManagers: vi.fn() }));
vi.mock("@/lib/change-log", () => ({ listChanges: vi.fn(), takeSnapshot: vi.fn(), recordChange: vi.fn() }));
vi.mock("@/lib/review-queue", () => ({ loadReviewItems: vi.fn(), groupReviewItems: vi.fn(() => []) }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ groupBy: async () => [{ status: "open", count: 3 }, { status: "needs_human", count: 2 }] }) }),
    }),
  },
}));

const NAMES = [
  "get_overview",
  "get_tickets",
  "get_review_queue",
  "list_canned_replies",
  "get_test_cases",
  "get_recent_changes",
  "list_human_managers",
];

async function invoke(name: string, input: Record<string, unknown> = {}): Promise<string> {
  const found = buildAssistantReadTools("org-1").find((t) => (t as { name?: string }).name === name) as
    | { invoke: (context: unknown, raw: string) => Promise<string> }
    | undefined;
  if (!found) throw new Error(`${name} not found`);
  return found.invoke(undefined, JSON.stringify(input));
}

describe("assistant read tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("are part of the Assistant's tools", () => {
    const tools = buildAssistantTools({ displayName: "Mike", managerName: "Charan" } as typeof workerProfiles.$inferSelect, "org-1", "conv-1");
    const have = tools.map((t) => (t as { name?: string }).name);
    for (const name of NAMES) expect(have).toContain(name);
  });

  it("lists canned replies, and says so when there are none", async () => {
    vi.mocked(listCannedReplies).mockResolvedValueOnce([]);
    expect(await invoke("list_canned_replies")).toBe("No canned replies yet.");
    vi.mocked(listCannedReplies).mockResolvedValueOnce([
      { title: "Refunds", situation: "asks about a refund", reply: "We refund within 30 days." },
    ] as Awaited<ReturnType<typeof listCannedReplies>>);
    expect(await invoke("list_canned_replies")).toContain("Refunds (when: asks about a refund)");
  });

  it("reports test cases and the failures of the latest finished replay", async () => {
    vi.mocked(listEvalCases).mockResolvedValue([{}, {}] as Awaited<ReturnType<typeof listEvalCases>>);
    vi.mocked(enabledEvalCases).mockResolvedValue([{}] as Awaited<ReturnType<typeof enabledEvalCases>>);
    vi.mocked(listEvalRuns).mockResolvedValue([
      {
        startedAt: new Date("2026-11-01T10:00:00Z"),
        status: "done",
        passed: 1,
        total: 2,
        score: 0.5,
        error: null,
        results: [{ question: "Do you ship abroad?", pass: false, reason: "Said it did not know" }],
      },
    ] as Awaited<ReturnType<typeof listEvalRuns>>);
    const text = await invoke("get_test_cases");
    expect(text).toContain("2 test case(s), 1 enabled.");
    expect(text).toContain("1 of 2 passed (50%)");
    expect(text).toContain('"Do you ship abroad?": Said it did not know');
  });

  it("says the review queue is empty when it is", async () => {
    vi.mocked(loadReviewItems).mockResolvedValue([]);
    expect(await invoke("get_review_queue", { groups: 5 })).toContain("review queue is empty");
  });

  it("explains when no extra human managers are set up", async () => {
    vi.mocked(listManagers).mockResolvedValue([]);
    expect(await invoke("list_human_managers")).toContain("No extra human managers");
  });
});

describe("buildSituationBrief", () => {
  it("states the live queue and the last test score", async () => {
    vi.mocked(listEvalRuns).mockResolvedValue([{ status: "done", passed: 8, total: 10, score: 0.8 }] as Awaited<ReturnType<typeof listEvalRuns>>);
    const brief = await buildSituationBrief("org-1");
    expect(brief).toContain("3 open with the worker, 2 waiting for a person");
    expect(brief).toContain("Last test replay: 8 of 10 passed (80%)");
  });

  it("returns nothing rather than throwing when lookups fail", async () => {
    vi.mocked(listEvalRuns).mockRejectedValue(new Error("db down"));
    const brief = await buildSituationBrief("org-1");
    expect(brief).not.toContain("Last test replay");
  });
});
