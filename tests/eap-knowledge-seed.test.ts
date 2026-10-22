import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOkf } from "@/lib/knowledge";

// The EAP articles are customer-facing and come from EAP's own procedure and field sheet. These checks keep it that way.
const DIR = path.join(process.cwd(), "seed", "eap-knowledge");
const files = readdirSync(DIR).filter((name) => name.endsWith(".md"));

describe("the EAP knowledge articles", () => {
  it("are all valid articles with a title, description and source", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const doc = parseOkf(readFileSync(path.join(DIR, file), "utf8"), file.replace(/\.md$/, ""));
      expect(doc.conceptId, file).toBe(file.replace(/\.md$/, ""));
      expect(doc.title.length, file).toBeGreaterThan(10);
      expect(doc.description?.length ?? 0, file).toBeGreaterThan(10);
      expect(doc.resource, file).toBeTruthy();
      expect(doc.body.length, file).toBeGreaterThan(200);
    }
  });

  it("leave out what a customer must not see: staff names, internal targets and routing", () => {
    const text = files.map((file) => readFileSync(path.join(DIR, file), "utf8")).join("\n");
    for (const name of ["Asif", "Haryanto", "Cipto", "Budi", "Munib", "Yohana", "AlexH", "BrianH", "Alec Shewell"]) expect(text).not.toContain(name);
    expect(text).not.toMatch(/\b80 hours\b|\b4 hours\b|requested participant|Assignment guide/i);
  });

  it("name the high-priority line exactly as EAP does", () => {
    expect(readFileSync(path.join(DIR, "eap-urgent-issues.md"), "utf8")).toContain("1-905-702-1380, extension 1");
  });
});
