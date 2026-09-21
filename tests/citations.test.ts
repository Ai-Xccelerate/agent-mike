import { describe, expect, it } from "vitest";
import { normalizeCitations, withNormalizedCitations } from "@/lib/citations";

describe("normalizeCitations", () => {
  it("keeps string titles", () => {
    expect(normalizeCitations(["About AI Xccelerate", " FAQ "])).toEqual([
      "About AI Xccelerate",
      "FAQ",
    ]);
  });

  it("extracts title from legacy rich citation objects", () => {
    expect(
      normalizeCitations([
        {
          title: "About AI Xccelerate",
          heading: "Overview",
          resource: "https://www.aixccelerate.com/",
          concept_id: "aix/company-overview",
          document_id: "e97380b1-ac05-4b53-ab18-6d22e52fa2f4",
        },
      ]),
    ).toEqual(["About AI Xccelerate"]);
  });

  it("falls back to heading when title is missing", () => {
    expect(normalizeCitations([{ heading: "Overview" }])).toEqual(["Overview"]);
  });

  it("ignores empty and unknown values", () => {
    expect(normalizeCitations([null, 12, {}, "", { title: "  " }])).toEqual([]);
  });

  it("rewrites message citations in place shape", () => {
    const message = withNormalizedCitations({
      id: "m1",
      citations: [{ title: "FAQ", document_id: "x" }],
    });
    expect(message.citations).toEqual(["FAQ"]);
    expect(message.id).toBe("m1");
  });
});
