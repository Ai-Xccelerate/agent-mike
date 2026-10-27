import { describe, expect, it } from "vitest";
import { knowledgeBySection, withOneFollowUp } from "@/lib/agent";

const match = (title: string, topic?: string) => ({ documentId: title, title, heading: null, content: `Steps for ${title}.`, rank: 1, ...(topic ? { topic } : {}) });

describe("the reference material for a many-part message", () => {
  it("is grouped under the question each section was found for, with anything else after", () => {
    const text = knowledgeBySection([match("Add a New Provider", "add a provider"), match("Provider Search", "search for a provider"), match("Add Provider Notes", "add a provider"), match("Overview")]);
    expect(text.indexOf("## Material for: add a provider")).toBeLessThan(text.indexOf("## Material for: search for a provider"));
    expect(text.indexOf("### Add Provider Notes")).toBeLessThan(text.indexOf("## Material for: search for a provider"));
    expect(text.indexOf("## Other material")).toBeGreaterThan(text.indexOf("### Provider Search"));
    expect(text).toContain("### Overview");
  });

  it("is the plain list, exactly as before, when there are no separate questions", () => {
    expect(knowledgeBySection([match("A"), match("B")])).toBe("### A\nSteps for A.\n\n### B\nSteps for B.");
  });
});

describe("the follow-up question in a many-part answer", () => {
  it("is asked once, at the end, however many sections repeated it", () => {
    const answer = "### One\n1. Do this.\n\nDid that solve it?\n\n### Two\n1. Do that.\n\nDid that solve it?\n\n### Three\nNot covered.";
    expect(withOneFollowUp(answer)).toBe("### One\n1. Do this.\n\n### Two\n1. Do that.\n\n### Three\nNot covered.\n\nDid that solve it?");
  });

  it("keeps the last one when it is the only closing question, and leaves single answers and numbered steps alone", () => {
    expect(withOneFollowUp("1. Open Providers.\n2. Choose New.\n\nDid that solve it?")).toBe("1. Open Providers.\n2. Choose New.\n\nDid that solve it?");
    expect(withOneFollowUp("Steps.\n\nDid this cover it?\n\nMore steps.\n\nDid this cover it?")).toBe("Steps.\n\nMore steps.\n\nDid this cover it?");
    expect(withOneFollowUp("Steps.\n\nMore steps.")).toBe("Steps.\n\nMore steps.");
    expect(withOneFollowUp("1. Are you signed in?\n2. Are you signed in?")).toBe("1. Are you signed in?\n2. Are you signed in?");
  });
});
