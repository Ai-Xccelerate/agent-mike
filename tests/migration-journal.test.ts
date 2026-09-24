import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * drizzle-kit migrate only runs a migration whose journal `when` is greater
 * than the newest `created_at` already recorded in __drizzle_migrations —
 * anything lower is skipped silently on every database that's past it.
 * That has bitten this repo twice (0020-0022, fixed in 33b5665; 0023). A new
 * entry's `when` must be the previous entry's + 1, or Date.now() if larger.
 */
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

type JournalEntry = { idx: number; when: number; tag: string };

const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};

// Out of order since before this check existed, and already applied on every
// existing database — re-timing them now would be riskier than leaving them.
const KNOWN_OUT_OF_ORDER = new Set([
  "0012_enabled_skills",
  "0013_conversation_human_controlled",
  "0014_blushing_mongoose",
]);

describe("migration journal", () => {
  it("numbers entries consecutively and has a SQL file for each", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(entry.tag.startsWith(String(i).padStart(4, "0") + "_")).toBe(true);
      expect(existsSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`))).toBe(true);
    });
  });

  it("gives every entry a `when` greater than all entries before it", () => {
    let newest = 0;
    const outOfOrder: string[] = [];
    for (const entry of journal.entries) {
      if (entry.when <= newest && !KNOWN_OUT_OF_ORDER.has(entry.tag)) {
        outOfOrder.push(`${entry.tag} (when ${entry.when} <= ${newest})`);
      }
      newest = Math.max(newest, entry.when);
    }
    expect(outOfOrder).toEqual([]);
  });
});
