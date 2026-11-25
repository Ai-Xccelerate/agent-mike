import { describe, expect, it } from "vitest";
import { buildCorpus, normalizeQuestion, soundKey } from "@/lib/query-normalize";

// The words of a small help centre, each in enough sections to count as a real word of the pages.
const sections = Array.from({ length: 8 }, (_, i) => ({
  title: i % 2 ? "Merging Clients" : "Data Validation",
  heading: null,
  content: "Merge duplicate clients. Validation of the form before saving. Write the article for the knowledge base. Scheduling an appointment with the self-scheduling client portal. Parallels connection and password reset.",
}));
const corpus = buildCorpus(sections, ["Merging Clients", "Data Validation", "Self-Scheduling Configuration", "Parallels Support Guide"]);
const fix = (question: string) => normalizeQuestion(question, corpus).text;

describe("spelling put right from the pages' own words", () => {
  it.each([
    ["Why do I get a validashun error?", "validation"],
    ["How do I mreg two clients?", "merge"],
    ["How do I add an artical?", "article"],
    ["How do I configure the self-schedulling app?", "self-scheduling"],
    ["i cannot open paralels", "parallels"],
  ])("%s", (question, word) => {
    expect(fix(question).toLowerCase()).toContain(word);
  });

  it("keeps the sound of a word: endings said alike share a key", () => {
    expect(soundKey("validashun")).toBe(soundKey("validation"));
    expect(soundKey("mreg")).toBe(soundKey("merge"));
  });

  it("leaves words the pages use, and words they do not have a near neighbour for, alone", () => {
    expect(fix("How do I merge a client with the portal?")).toBe("How do I merge a client with the portal?");
    expect(fix("We use Okta for sign in")).toBe("We use Okta for sign in");
    expect(fix("it is not working")).toBe("it is not working");
  });
});
