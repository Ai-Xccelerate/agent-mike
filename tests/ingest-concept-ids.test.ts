import { describe, expect, it } from "vitest";
import { assignConceptIds } from "@/lib/knowledge-ids";

/**
 * Regression cover for silent data loss on upload.
 *
 * Ingest upserts by concept id, and the id came from the filename with its
 * extension stripped — so `policy.md` and `policy.txt` both claimed `policy`,
 * the second quietly replaced the first, and both were reported as ingested.
 * Two files in, one document out, no error.
 */
describe("concept ids within one upload", () => {
  it("gives every file its own id when the names differ", () => {
    expect(assignConceptIds(["refunds.md", "escalation.md"])).toEqual(["refunds", "escalation"]);
  });

  it("does not let two files collapse into one document", () => {
    const ids = assignConceptIds(["policy.md", "policy.txt"]);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("policy");
    expect(ids[1]).toBe("policy-txt");
  });

  it("keeps going when the extension collides too", () => {
    // Different directories, same name and extension — the browser sends both.
    const ids = assignConceptIds(["policy.md", "policy.txt", "policy.txt"]);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe("policy-txt-2");
  });

  it("is stable across uploads, so re-ingesting a file still updates it", () => {
    // The first file always keeps the bare slug. That is what makes
    // re-uploading policy.md the way to edit that document rather than a way
    // to accumulate copies.
    expect(assignConceptIds(["policy.md"])[0]).toBe("policy");
    expect(assignConceptIds(["policy.md", "other.md"])[0]).toBe("policy");
  });

  it("falls back to a positional id for a name that slugifies to nothing", () => {
    const ids = assignConceptIds(["___.md", "!!!.md"]);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe("doc-1");
  });

  it("handles an empty batch", () => {
    expect(assignConceptIds([])).toEqual([]);
  });
});
