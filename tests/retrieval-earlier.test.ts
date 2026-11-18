import { describe, expect, it } from "vitest";
import { withEarlierPages } from "@/lib/retrieval-query";
import type { RetrievalResult } from "@/lib/retrieval";
import type { KnowledgeMatch } from "@/lib/knowledge";

const match = (id: string, title: string, heading: string | null = null): KnowledgeMatch => ({ documentId: id, title, heading, content: `${title} ${heading ?? ""}`, rank: 1 });
const result = (...matches: KnowledgeMatch[]): RetrievalResult => ({ matches, sources: [{ source: "confluence", count: matches.length, error: null, via: "saved copy" }] });

describe("keeping the pages found for the earlier messages", () => {
  const main = result(match("a", "Error [01/00000011] Failed to change password"), match("b", "Setting Up a Parallels Connection", "Step-by-step guide"));
  const earlier = result(match("c", "Parallels Support Guide", "First Steps"), match("b", "Setting Up a Parallels Connection", "Step-by-step guide"), match("d", "Frequent Parallels Errors"));

  it("adds the earlier pages that are not already there, after the follow-up's own, in order", () => {
    const merged = withEarlierPages(main, earlier);
    expect(merged.matches.map((m) => m.title)).toEqual([
      "Error [01/00000011] Failed to change password",
      "Setting Up a Parallels Connection",
      "Parallels Support Guide",
      "Frequent Parallels Errors",
    ]);
    expect(merged.sources).toEqual(main.sources);
  });

  it("keeps at most `extra` earlier pages", () => {
    expect(withEarlierPages(main, earlier, 1).matches.map((m) => m.title)).toEqual([
      "Error [01/00000011] Failed to change password",
      "Setting Up a Parallels Connection",
      "Parallels Support Guide",
    ]);
  });

  it("changes nothing when there are no earlier pages, or they are all there already", () => {
    expect(withEarlierPages(main, null)).toBe(main);
    expect(withEarlierPages(main, result(match("a", "Error [01/00000011] Failed to change password")))).toBe(main);
  });
});
