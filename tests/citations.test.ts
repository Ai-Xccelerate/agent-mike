import { describe, expect, it } from "vitest";
import { normalizeCitations, withNormalizedCitations, withoutSourceLine } from "@/lib/citations";

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

describe("withoutSourceLine", () => {
  const titles = ["Service Member Registration for the Self-Scheduler", "Add a New Provider", "Accounting Export Module"];

  it("removes a From line at the end, on its own line or after a sentence", () => {
    expect(withoutSourceLine("1. Open the link.\n2. Sign in.\n\nDid this solve it?\n\nFrom: Service Member Registration for the Self-Scheduler", titles)).toBe(
      "1. Open the link.\n2. Sign in.\n\nDid this solve it?",
    );
    expect(withoutSourceLine("Tick Self-Scheduling. From: Add a New Provider", titles)).toBe("Tick Self-Scheduling.");
  });

  it("removes it in the middle, and joins two sources", () => {
    expect(withoutSourceLine("Steps here.\n\nFrom: Add a New Provider; Accounting Export Module\n\nDid that solve it?", titles)).toBe("Steps here.\n\nDid that solve it?");
    expect(withoutSourceLine("Steps. From: Add a New Provider Did that solve it?", titles)).toBe("Steps. Did that solve it?");
  });

  it("leaves a sentence that merely contains from, and a source that was never retrieved, alone", () => {
    expect(withoutSourceLine("Mail from: noreply@example.com may land in spam.", titles)).toBe("Mail from: noreply@example.com may land in spam.");
    expect(withoutSourceLine("Steps.\n\nFrom: Some page she was not given", titles)).toBe("Steps.\n\nFrom: Some page she was not given");
    expect(withoutSourceLine("Nothing to remove.", [])).toBe("Nothing to remove.");
  });

  it("removes it when the worker bolded or italicised the title, as it did on prod", () => {
    expect(withoutSourceLine("1. Click New.\n2. Select CISD/Trauma.\nFrom: **Add a New Provider**   \nDid that solve it?", titles)).toBe("1. Click New.\n2. Select CISD/Trauma.\nDid that solve it?");
    expect(withoutSourceLine("Steps.\n\nFrom: _Add a New Provider_; **Accounting Export Module**", titles)).toBe("Steps.");
  });

  it("matches the title whatever its case, and titles with punctuation", () => {
    expect(withoutSourceLine("Done.\n\nFrom: priority levels (and what each means)", ["Priority levels (and what each means)"])).toBe("Done.");
  });
});

describe("withoutSourceLine when she names an extra heading after the article", () => {
  it("removes the whole line, not just the article name", () => {
    const answer = "Click New.\n\nFrom: Add a New Client Organization, Steps to adding a new customer group\n\nDid that solve it?";
    expect(withoutSourceLine(answer, ["Add a New Client Organization"])).toBe("Click New.\n\nDid that solve it?");
  });
  it("removes it at the end of a line of steps too", () => {
    expect(withoutSourceLine("Click New. From: Add a New Client Organization, Steps to adding", ["Add a New Client Organization"])).toBe("Click New.");
  });
});
