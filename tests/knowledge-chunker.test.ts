import { describe, expect, it } from "vitest";
import { chunkPage, embeddingInput } from "@/lib/knowledge-chunker";

describe("cutting a page into sections", () => {
  it("makes one section per heading, keeping each heading", () => {
    const text = [
      "Intro line that explains the page and is long enough to stand on its own as a section of text.",
      "## Register\nShare the link with the member. They fill in the sign-in page and then check their email for the password link. If the email is late, wait a few minutes before trying again.",
      "## Troubleshooting\nCheck the spam folder first. Make sure the address is valid and that the member can reach it. Then ask the administrator.",
    ].join("\n\n");
    const sections = chunkPage("Self-Scheduler Registration", text);
    expect(sections.map((s) => s.heading)).toEqual([null, "Register", "Troubleshooting"]);
    expect(sections.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(sections[1].content).toContain("Share the link");
    expect(sections[1].content).not.toContain("## ");
  });

  it("splits a long section instead of cutting it off, and never loses text", () => {
    const paragraph = "Step text that is a sentence long enough to matter. ".repeat(12);
    const text = `## Steps\n${Array.from({ length: 8 }, (_, i) => `${i + 1}. ${paragraph}`).join("\n\n")}`;
    const sections = chunkPage("Long page", text);
    expect(sections.length).toBeGreaterThan(2);
    expect(sections.every((s) => s.content.length <= 1700)).toBe(true);
    expect(sections.every((s) => s.heading === "Steps")).toBe(true);
    const all = sections.map((s) => s.content).join(" ");
    for (let i = 1; i <= 8; i += 1) expect(all).toContain(`${i}. Step text`);
  });

  it("splits one huge paragraph with no breaks", () => {
    const sections = chunkPage("Table dump", "x".repeat(5000));
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.map((s) => s.content).join("").length).toBe(5000);
  });

  it("joins tiny pieces to the section before so each one is worth finding", () => {
    const text = [
      "## Overview\nA reasonably long overview paragraph that describes what this page is for and who should read it, in some detail.",
      "## Note\nSee also.",
    ].join("\n\n");
    const sections = chunkPage("Page", text);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain("See also.");
  });

  it("gives an empty or title-only page one section made of its title, and an empty page none", () => {
    expect(chunkPage("Options", "")).toEqual([]);
    expect(chunkPage("Options", "## Only a heading")).toEqual([{ position: 0, heading: "Only a heading", content: "Only a heading" }]);
  });

  it("gives the embedding the title and heading, so a short section keeps its context", () => {
    expect(embeddingInput("Audit Trail", { position: 0, heading: "Who changed it", content: "Open the file." })).toBe("Audit Trail\nWho changed it\nOpen the file.");
    expect(embeddingInput("Audit Trail", { position: 0, heading: null, content: "Open the file." })).toBe("Audit Trail\nOpen the file.");
  });
});
