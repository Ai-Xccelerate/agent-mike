import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexState } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { INDEX_SOURCE, clearRefreshMemory, refreshKnowledgeIndexIfStale, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { MIN_MEANING_SCORE, clearKnowledgeSearchCache, searchKnowledgeIndex } from "@/lib/knowledge-search";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";

// A stand-in for meaning: texts about the same idea land on the same axis, whatever words they use.
const AXES = [
  ["audit", "trail", "altered", "edits", "history", "activity"],
  ["register", "registration", "signup", "enrol"],
  ["utilization", "report", "employer"],
  ["kubernetes", "ingress", "controller"],
  ["cooking", "pasta", "boil"],
];
const embed = vi.fn(async (texts: string[]) =>
  texts.map((text) => {
    const lower = text.toLowerCase();
    const v = AXES.map((words) => words.filter((w) => lower.includes(w)).length);
    // Text about none of these topics sits on its own axis, apart from every topic above.
    return [...v, v.every((n) => n === 0) ? 1 : 0];
  }),
);

type P = { id: string; title: string; text: string };
function source(pages: P[]): IndexSource {
  return {
    source: "confluence",
    listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: 1, link: null })),
    fetchPages: async (ids): Promise<IndexPage[]> => pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: null })),
  };
}
const FILL = " This section describes the topic in enough words to be a section of its own and to be worth finding later.";

let orgId: string;
beforeEach(async () => {
  orgId = `org-search-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  clearKnowledgeSearchCache();
  clearRefreshMemory();
  embed.mockClear();
});

async function indexed(pages: P[]) {
  await syncKnowledgeIndex(orgId, { source: source(pages), embed });
  embed.mockClear();
}

describe("searching the saved copy", () => {
  it("finds a section by keyword, with its title and heading", async () => {
    await indexed([
      { id: "1", title: "Self-Scheduler Registration", text: `## Register\nShare the link with the member and ask them to register.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do members register?", { embed });
    expect(matches[0]).toMatchObject({ title: "Self-Scheduler Registration", heading: "Register", documentId: "confluence:1" });
    expect(matches.map((m) => m.title)).not.toContain("Cooking");
  });

  it("returns nothing for a question unrelated to every page, and reports the scores it judged by", async () => {
    await indexed([
      { id: "1", title: "Audit Trail", text: `## Who made edits
Every change to a file is logged.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta
Boil water.${FILL}` },
    ]);
    const none = await searchKnowledgeIndex(orgId, "How do I configure a Kubernetes ingress controller?", { embed });
    expect(none.matches).toEqual([]);
    const some = await searchKnowledgeIndex(orgId, "Which tool tells me what colleagues altered?", { embed });
    expect(some.details[0]).toMatchObject({ title: "Audit Trail", meaning: expect.any(Number) });
    expect(some.details[0].meaning).toBeGreaterThanOrEqual(MIN_MEANING_SCORE);
  });

  it("finds a page by meaning when no word in the question is in the page", async () => {
    await indexed([
      { id: "1", title: "Audit Trail", text: `## Who made edits\nEvery change to a file is logged with the person and the time.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
    ]);
    const { matches, timings } = await searchKnowledgeIndex(orgId, "Which tool tells me what colleagues altered?", { embed });
    expect(timings.meaning).toBe("used");
    expect(matches[0].title).toBe("Audit Trail");
  });

  it("still answers from keywords when the meaning search is down", async () => {
    await indexed([{ id: "1", title: "Self-Scheduler Registration", text: `## Register\nAsk the member to register.${FILL}` }]);
    const down = vi.fn(async () => {
      throw new Error("embeddings request failed with 500");
    });
    const { matches, timings } = await searchKnowledgeIndex(orgId, "How do members register?", { embed: down });
    expect(timings.meaning).toBe("failed");
    expect(matches[0].title).toBe("Self-Scheduler Registration");
  });

  it("puts a section both searches like ahead of one only a single search likes", async () => {
    await indexed([
      { id: "1", title: "Utilization Report", text: `## Run it for an employer\nChoose the employer, then Preview the utilization report.${FILL}` },
      { id: "2", title: "Billing", text: `## Employer invoices\nThe employer receives an invoice.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "run a utilization report for one employer", { embed });
    expect(matches[0].documentId).toBe("confluence:1");
  });

  it("returns a page's sections in page order, at most three per page, and respects the limit", async () => {
    const steps = Array.from({ length: 6 }, (_, i) => `## Step ${i + 1}\nRegister step ${i + 1}: register the member.${FILL}`).join("\n\n");
    await indexed([
      { id: "1", title: "Registration Guide", text: steps },
      { id: "2", title: "Registration FAQ", text: `## Faq\nCan a member register twice? register.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "register a member", { embed, limit: 5 });
    expect(matches.length).toBeLessThanOrEqual(5);
    const fromGuide = matches.filter((m) => m.documentId === "confluence:1");
    expect(fromGuide.length).toBeLessThanOrEqual(3);
    const order = fromGuide.map((m) => Number(/Step (\d)/.exec(m.heading ?? "")?.[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Same page together: no other page's section between two of the guide's.
    const ids = matches.map((m) => m.documentId);
    expect(ids.join(",").replace(/confluence:1(,confluence:1)*/, "G")).not.toMatch(/G.*confluence:1/);
  });

  it("uses the question inside a long message, not its opening", async () => {
    await indexed([{ id: "1", title: "Utilization Report", text: `## Run it\nChoose the employer and preview the utilization report.${FILL}` }]);
    const preamble = "Hi team, hope you are well and thanks for all your help over the past months, it is much appreciated by everyone here. ".repeat(5);
    const { matches } = await searchKnowledgeIndex(orgId, `${preamble}Anyway, the actual thing I wanted to ask is how I can run a utilization report for one employer. Thanks, Sam.`, { embed });
    expect(matches[0].title).toBe("Utilization Report");
    expect(embed.mock.calls[0][0][0]).toContain("utilization report");
    expect(embed.mock.calls[0][0][0]).not.toContain("hope you are well");
  });

  it("returns nothing, without calling the embedder, when the copy is empty", async () => {
    const { matches } = await searchKnowledgeIndex(orgId, "anything at all", { embed });
    expect(matches).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("never returns another organization's sections", async () => {
    const other = `org-search-other-${crypto.randomUUID()}`;
    await ensureOrganization(other);
    await syncKnowledgeIndex(other, { source: source([{ id: "9", title: "Their Secret Register Guide", text: `## Register\nTheir register steps.${FILL}` }]), embed });
    await indexed([{ id: "1", title: "Our Cooking", text: `## Pasta\nBoil water.${FILL}` }]);
    const { matches } = await searchKnowledgeIndex(orgId, "register a member", { embed });
    expect(matches.map((m) => m.title)).not.toContain("Their Secret Register Guide");
  });

  it("picks up a new sync without a restart, and remembers a repeated question's numbers", async () => {
    await indexed([{ id: "1", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` }]);
    expect((await searchKnowledgeIndex(orgId, "register a member", { embed })).matches.map((m) => m.title)).not.toContain("Registration");
    await new Promise((r) => setTimeout(r, 15));
    await indexed([
      { id: "1", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
      { id: "2", title: "Registration", text: `## Register\nAsk the member to register.${FILL}` },
    ]);
    embed.mockClear();
    expect((await searchKnowledgeIndex(orgId, "register a member", { embed })).matches.map((m) => m.title)).toContain("Registration");
    // The question's numbers were worked out on the first search and are remembered.
    expect(embed).not.toHaveBeenCalled();
    await searchKnowledgeIndex(orgId, "a brand new question about registration", { embed });
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe("keeping the copy fresh", () => {
  const stateRow = (finishedAgoMinutes: number | null, runningForMinutes: number | null = null) => ({
    organizationId: orgId,
    source: INDEX_SOURCE,
    lastFinishedAt: finishedAgoMinutes === null ? null : new Date(Date.now() - finishedAgoMinutes * 60_000),
    runningUntil: runningForMinutes === null ? null : new Date(Date.now() + runningForMinutes * 60_000),
  });

  it("starts a background sync when the copy is old, and not again for a few minutes", async () => {
    await db.insert(knowledgeIndexState).values(stateRow(30));
    const run = vi.fn(async () => ({ pages: 0, added: 0, changed: 0, removed: 0, unchanged: 0, sections: 0, embedded: 0, ms: 1 }));
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh copy and a running sync alone, and syncs one that never ran", async () => {
    const run = vi.fn(async () => ({ pages: 0, added: 0, changed: 0, removed: 0, unchanged: 0, sections: 0, embedded: 0, ms: 1 }));
    await db.insert(knowledgeIndexState).values(stateRow(2));
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    await db.update(knowledgeIndexState).set({ lastFinishedAt: new Date(Date.now() - 60 * 60_000), runningUntil: new Date(Date.now() + 5 * 60_000) }).where(eq(knowledgeIndexState.organizationId, orgId));
    clearRefreshMemory();
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    const fresh = `org-search-fresh-${crypto.randomUUID()}`;
    await ensureOrganization(fresh);
    expect(await refreshKnowledgeIndexIfStale(fresh, run)).toBe(true);
  });
});
