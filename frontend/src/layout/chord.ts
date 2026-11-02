/**
 * The `g` chord (`g` then a letter goes to a place; `useGlobalShortcuts`),
 * shared with the page's own single-key shortcuts (`useListKeys`), so the
 * "d" of "g d" goes to Deals rather than also choosing a deal for a meeting.
 *
 * Its own module rather than `shortcuts.ts`, which the engine's copied code
 * shares with Persuade and the sync compares with upstream.
 */

let startedAt = 0;

/** How long after `g` the second key still counts. */
export const CHORD_MS = 1200;

export function startChord(now = Date.now()): void {
  startedAt = now;
}

export function endChord(): void {
  startedAt = 0;
}

/** Whether a `g` was pressed a moment ago and its second key is awaited. */
export function inChord(now = Date.now()): boolean {
  return startedAt !== 0 && now - startedAt < CHORD_MS;
}
