import { describe, expect, it } from "vitest";
import { FIRST_LINE, MIN_DWELL_MS, SLOW_AFTER_MS, SLOW_LINE, receive, release, startLine } from "../frontend/src/lib/waiting-line";

// The line shown while Eva writes a reply: the first line at once, each reported step held long enough to read,
// and only the latest when several arrive together. The reply never waits for any of it (the card is removed on arrival).

describe("the line shown while a reply is written", () => {
  it("starts with a first line, before the server has said anything", () => {
    expect(startLine(1000)).toEqual({ shown: FIRST_LINE, shownAt: 1000, queued: null });
  });

  it("shows a step at once when the current line has been readable long enough", () => {
    const result = receive(startLine(0), "Checking our help articles…", MIN_DWELL_MS);
    expect(result.waitMs).toBe(0);
    expect(result.line.shown).toBe("Checking our help articles…");
  });

  it("holds a step that arrives too soon until the current line has had its time", () => {
    const result = receive(startLine(0), "Checking our help articles…", 350);
    expect(result.line.shown).toBe(FIRST_LINE);
    expect(result.line.queued).toBe("Checking our help articles…");
    expect(result.waitMs).toBe(MIN_DWELL_MS - 350);
    expect(release(result.line, MIN_DWELL_MS).shown).toBe("Checking our help articles…");
  });

  it("shows only the latest when several steps arrive while a line is being read", () => {
    const first = receive(startLine(0), "Checking our help articles…", 300);
    const second = receive(first.line, "Putting together a reply…", 500);
    expect(second.line.queued).toBe("Putting together a reply…");
    expect(release(second.line, MIN_DWELL_MS).shown).toBe("Putting together a reply…");
  });

  it("ignores a repeat of the line already on screen, and an empty line", () => {
    const line = startLine(0);
    expect(receive(line, FIRST_LINE, 100).line).toEqual(line);
    expect(receive(line, "   ", 100).line).toEqual(line);
  });

  it("has a fallback for a slow turn, after eight seconds", () => {
    expect(SLOW_AFTER_MS).toBe(8000);
    expect(SLOW_LINE).toBe("This one is taking a little longer…");
  });

  it("releases nothing when nothing is queued", () => {
    const line = startLine(0);
    expect(release(line, 5000)).toBe(line);
  });
});
