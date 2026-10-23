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

import { citedTitles } from "@/lib/citations";

describe("citedTitles", () => {
  const matches = [{ title: "Choosing the right support request type" }, { title: "Priority levels and what each means" }, { title: "Screen sharing with the support team" }];

  it("credits only the articles the reply names", () => {
    const answer = "Use User / License Change.\n\nFrom: Choosing the right support request type";
    expect(citedTitles(answer, matches)).toEqual(["Choosing the right support request type"]);
  });

  it("matches without regard to case, and lists each article once", () => {
    const answer = "See PRIORITY LEVELS AND WHAT EACH MEANS. From: priority levels and what each means";
    expect(citedTitles(answer, matches)).toEqual(["Priority levels and what each means"]);
  });

  it("credits nothing for an answer that names no article, even if articles were retrieved", () => {
    expect(citedTitles("Happy to help. What product is this about?", matches)).toEqual([]);
  });

  it("ignores empty titles and repeated matches", () => {
    expect(citedTitles("From: A guide", [{ title: "A guide" }, { title: "a guide" }, { title: "  " }])).toEqual(["A guide"]);
  });
});

import { answerSupport, boldTerms, groundedTitles, looksUngrounded } from "@/lib/citations";

describe("what an answer follows", () => {
  const pages = [
    { title: "Authorization Monitoring", content: "Open Integrations, then Providerfiles. It opens to Authorizations under Portal Activity. Use Authorizations for active cases." },
    { title: "EAP Expert V3 Release Notes", content: "New this release: faster grids." },
  ];
  const answer = "1. Go to **Integrations** in the left navigation.\n2. Select **Providerfiles**. It opens to **Authorizations** under **Portal Activity**.";

  it("reads the names an answer bolds", () => {
    expect(boldTerms(answer)).toEqual(["integrations", "providerfiles", "authorizations", "portal activity"]);
    expect(boldTerms("No bold here.")).toEqual([]);
  });

  it("scores each page by the share of those names it carries", () => {
    const support = answerSupport(answer, pages);
    expect(support[0]).toEqual({ title: "Authorization Monitoring", coverage: 1 });
    expect(support[1].coverage).toBe(0);
  });

  it("credits the page an answer clearly follows, and none when it follows nothing", () => {
    expect(groundedTitles(answer, pages)).toEqual(["Authorization Monitoring"]);
    expect(groundedTitles("Click **Foo** then **Bar**.", pages)).toEqual([]);
    expect(looksUngrounded("Click **Foo** then **Bar**.", pages)).toBe(true);
    expect(looksUngrounded(answer, pages)).toBe(false);
  });

  it("says nothing when the answer bolds too little to tell", () => {
    expect(answerSupport("Press **Save**.", pages)).toEqual([]);
    expect(looksUngrounded("Press **Save**.", pages)).toBe(false);
  });
});
