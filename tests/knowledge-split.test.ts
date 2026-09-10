import { describe, expect, it } from "vitest";
import { splitMarkdown } from "@/lib/knowledge-split";
import { parseOkf, InvalidOKFDocument } from "@/lib/knowledge";

describe("splitMarkdown", () => {
  it("preserves headings as chunk metadata", () => {
    const chunks = splitMarkdown("# Setup\nDo this first.\n\n# Billing\nDo that second.");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ heading: "Setup", content: "Do this first." });
    expect(chunks[1]).toEqual({ heading: "Billing", content: "Do that second." });
  });

  it("breaks long sections into multiple chunks under the size cap", () => {
    const paragraph = Array.from({ length: 40 }, (_, i) => `Sentence ${i}.`).join(" "); // ~480 chars
    const paragraphs = Array.from({ length: 6 }, () => paragraph); // ~2900 chars total, well over the 1800 cap
    const body = `# Long\n${paragraphs.join("\n\n")}`;
    const chunks = splitMarkdown(body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1800);
    }
  });
});

describe("parseOkf", () => {
  it("throws InvalidOKFDocument when 'type' frontmatter is missing", () => {
    expect(() => parseOkf("---\ntitle: No type here\n---\nBody", "fallback")).toThrow(InvalidOKFDocument);
  });

  it("extends Error", () => {
    expect(new InvalidOKFDocument("x")).toBeInstanceOf(Error);
  });
});
