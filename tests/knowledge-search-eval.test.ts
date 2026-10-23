import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOrganization } from "@/lib/bootstrap";
import { syncKnowledgeIndex } from "@/lib/knowledge-index";
import { clearKnowledgeSearchCache } from "@/lib/knowledge-search";
import { runSearchExperiment } from "@/lib/knowledge-search-eval";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";

// The experiment runner embeds questions itself, so the real embedder is replaced for the whole file.
const AXES = [["register", "registration"], ["audit", "trail"], ["cooking", "pasta"]];
const embed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/embeddings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/embeddings")>()),
  embedTexts: embed,
}));

const FILL = " This section describes the topic in enough words to be a section of its own and to be worth finding later, with a little more text to clear the stub size limit for a page. ".repeat(3);
const pages = [
  { id: "1", title: "Registration", text: `## Register\nAsk the member to register.${FILL}` },
  { id: "2", title: "Audit Trail", text: `## Log\nEvery change is logged.${FILL}` },
  { id: "3", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
  { id: "4", title: "Options", text: "tiny" },
];
const source: IndexSource = {
  source: "confluence",
  listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: 1, link: null })),
  fetchPages: async (ids): Promise<IndexPage[]> => pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: null })),
};

let orgId: string;
beforeEach(async () => {
  embed.mockReset().mockImplementation(async (texts: string[]) =>
    texts.map((text) => {
      const lower = text.toLowerCase();
      const v = AXES.map((words) => words.filter((w) => lower.includes(w)).length);
      return [...v, v.every((n) => n === 0) ? 1 : 0];
    }),
  );
  orgId = `org-exp-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  clearKnowledgeSearchCache();
  await syncKnowledgeIndex(orgId, { source, embed });
});

describe("the search experiment runner", () => {
  it("scores each setting on one question per page plus the questions sent, counting empty pages apart", async () => {
    const results = await runSearchExperiment(
      orgId,
      [{ name: "defaults", tuning: {} }, { name: "no title signal", tuning: { weights: { keyword: 1, meaning: 1, title: 0 } } }],
      [{ q: "Which tool tells me what changed in a record: audit?", expected: "Audit Trail" }, { q: "How do I fly a plane?", expected: "Cooking" }],
      ["How do I configure a Kubernetes ingress controller?"],
    );
    expect(results.map((r) => r.name)).toEqual(["defaults", "no title signal"]);
    const first = results[0];
    expect(first.pages.asked).toBe(4);
    expect(first.pages.found).toBeGreaterThanOrEqual(3);
    expect(first.pages.first).toBeGreaterThanOrEqual(3);
    // "Options" holds one word, so it is a stub: it cannot be found and is not counted as a real miss.
    expect(first.pages.realMisses).toBe(0);
    expect(first.questions).toMatchObject({ asked: 2, found: 1, first: 1, missed: ["Cooking"] });
    expect(first.boundaryAverage).toBeGreaterThanOrEqual(0);
    expect(first.medianMs).toBeGreaterThanOrEqual(0);
  });

  it("asks the embedding service for the questions in batches, not one request each", async () => {
    await runSearchExperiment(orgId, [{ name: "a", tuning: {} }, { name: "b", tuning: { limit: 4 } }], [], []);
    const calls = embed.mock.calls.length;
    // One batch to prime the questions (after the sync's own call); the second setting reuses the numbers.
    expect(calls).toBeLessThanOrEqual(3);
  });
});
