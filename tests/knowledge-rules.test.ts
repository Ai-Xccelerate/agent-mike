import { describe, expect, it } from "vitest";
import { isKnowledgeFile, parseOkf, readOkfFrontmatter, uploadedKnowledgeRaw } from "@/lib/knowledge";
import { mergeIntegrationEnabled } from "@/lib/integrations";

describe("uploadedKnowledgeRaw (the Knowledge page's upload rules, shared with the Assistant)", () => {
  it("stores Markdown that carries OKF frontmatter as written, pinning only the concept id", () => {
    const text = "---\ntype: reference\ntitle: Returns\ndescription: How returns work\ntags: [returns]\n---\n# Returns\nFree within 30 days.";
    const { raw, storedAsWritten } = uploadedKnowledgeRaw("returns.md", "returns-v2", text);
    expect(storedAsWritten).toBe(true);
    const doc = parseOkf(raw, "fallback");
    expect(doc).toMatchObject({ conceptId: "returns-v2", title: "Returns", description: "How returns work", tags: ["returns"] });
    expect(doc.body).toBe("# Returns\nFree within 30 days.");
  });

  it("wraps PDFs titled after the file (no extension) and text titled with the filename", () => {
    expect(parseOkf(uploadedKnowledgeRaw("Policy.pdf", "policy", "Body").raw, "policy")).toMatchObject({ title: "Policy", conceptId: "policy" });
    expect(parseOkf(uploadedKnowledgeRaw("notes.txt", "notes", "Body").raw, "x")).toMatchObject({ title: "notes.txt" });
  });

  it("keeps the upload route strict about Markdown without frontmatter, but wraps it for New doc style use", () => {
    const strict = uploadedKnowledgeRaw("faq.md", "faq", "# FAQ\nText", { strictMarkdown: true });
    expect(() => parseOkf(strict.raw, "faq")).toThrow(/missing required field 'type'/);
    const lenient = uploadedKnowledgeRaw("faq.md", "faq", "# FAQ\nText", { title: "AI Worker FAQ" });
    expect(parseOkf(lenient.raw, "faq")).toMatchObject({ title: "AI Worker FAQ", body: "# FAQ\nText" });
    expect(lenient.storedAsWritten).toBe(false);
  });

  it("carries an existing article's description and tags into a wrapped update", () => {
    const { raw } = uploadedKnowledgeRaw("policy.pdf", "policy", "New body", { keep: { description: "Kept", tags: ["a"] } });
    expect(parseOkf(raw, "policy")).toMatchObject({ description: "Kept", tags: ["a"] });
  });

  it("only counts frontmatter that has the required type, and accepts only the page's file types", () => {
    expect(readOkfFrontmatter("---\ntitle: No type\n---\nx")).toBeNull();
    expect(readOkfFrontmatter("---\ntype: reference\nid: a\n---\nx")?.id).toBe("a");
    expect(["a.pdf", "b.md", "c.markdown", "d.txt", "e.text"].every(isKnowledgeFile)).toBe(true);
    expect(["a.csv", "b.json", "c.html", "d.docx"].some(isKnowledgeFile)).toBe(false);
  });
});

describe("mergeIntegrationEnabled", () => {
  it("flips only `enabled`, keeping the tool's other settings as its Settings route would", () => {
    const stored = { agent_wiki: { enabled: false, spaceId: "space-1", allowWrite: false }, scribe: { enabled: false, lookbackDays: 30 } };
    const merged = mergeIntegrationEnabled(stored, "agent_wiki", true);
    expect(merged?.agent_wiki).toMatchObject({ enabled: true, spaceId: "space-1", allowWrite: false });
    expect(merged?.scribe).toMatchObject({ enabled: false, lookbackDays: 30 });
    expect(mergeIntegrationEnabled(stored, "nope", true)).toBeNull();
  });
});
