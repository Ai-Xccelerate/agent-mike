/**
 * The one line that tells a customer what Eva is doing while a reply is being written.
 *
 * The line is only ever one of: a first line shown the moment the customer sends, a step the server reports (see
 * `onStatus` in lib/customer-turn.ts), or a fallback when the turn is slow. It never says what the result will be.
 *
 * Two rules keep it readable. A line stays on screen for at least MIN_DWELL_MS, so a step that takes 300 ms is not a
 * flash; and when several steps arrive while a line is still being read, only the latest is shown next. The reply itself
 * never waits for any of this: the card is removed the moment the reply arrives.
 */

export const MIN_DWELL_MS = 800;
export const SLOW_AFTER_MS = 8000;
export const FIRST_LINE = "Reading your message…";
export const SLOW_LINE = "This one is taking a little longer…";

export type Line = {
  /** The line on screen now. */
  shown: string;
  /** When it appeared, in milliseconds on any steady clock. */
  shownAt: number;
  /** A newer line waiting for the current one to be readable for long enough. */
  queued: string | null;
};

export function startLine(now: number): Line {
  return { shown: FIRST_LINE, shownAt: now, queued: null };
}

/**
 * A step was reported. Returns the new state and how long to wait before the queued line may be shown: 0 means it is
 * already on screen.
 */
export function receive(line: Line, label: string, now: number): { line: Line; waitMs: number } {
  const clean = label.trim();
  if (!clean || clean === line.shown) return { line: { ...line, queued: null }, waitMs: 0 };
  const remaining = MIN_DWELL_MS - (now - line.shownAt);
  if (remaining <= 0) return { line: { shown: clean, shownAt: now, queued: null }, waitMs: 0 };
  return { line: { ...line, queued: clean }, waitMs: remaining };
}

/** The wait is over: show the line that was queued, if there is one. */
export function release(line: Line, now: number): Line {
  if (!line.queued) return line;
  return { shown: line.queued, shownAt: now, queued: null };
}
