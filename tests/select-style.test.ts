import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fieldClass, selectFieldClass } from "../frontend/src/components/worker/settings/ui";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const SOURCE = join(__dirname, "..", "frontend", "src");
const isCustomListbox = (file: string) => file.endsWith(join("components", "form", "Select.tsx"));

describe("native selects leave room for the chevron the app draws on them", () => {
  it("the shared select class keeps the field style but trades px-4 for room on the right", () => {
    expect(fieldClass).toContain(" px-4 ");
    expect(selectFieldClass).not.toContain(" px-4 ");
    expect(selectFieldClass).toContain("pl-4 pr-10");
    expect(selectFieldClass).toContain("h-11");
  });

  it("every <select> in the app has right padding (or uses a shared select class), so text never runs under the arrow", () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of tsxFiles(SOURCE)) {
      if (isCustomListbox(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<select\b/g)) {
        count += 1;
        const window = source.slice(match.index, match.index + 900);
        if (!/selectFieldClass|selectControlClass|selectClass|\bpr-(?:8|9|10)\b/.test(window)) {
          missing.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
        }
      }
    }
    expect(count).toBeGreaterThan(15);
    expect(missing).toEqual([]);
  });

  it("no select draws a second chevron of its own beside the global one", () => {
    const doubled: string[] = [];
    for (const file of tsxFiles(SOURCE)) {
      if (isCustomListbox(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<\/select>\s*<ChevronDownIcon[^>]*pointer-events-none/g)) {
        doubled.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
    expect(doubled).toEqual([]);
  });
});
