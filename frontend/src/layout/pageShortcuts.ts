"use client";

/**
 * The keys a page answers to while it is on screen -- a list's j/k and its
 * rows' actions -- for the Help sheet (`ShortcutsDialog`) to list under "On
 * this page". The sheet promises only keys that work, so a page lists its
 * own as it mounts and they go when it does.
 *
 * A module-level store, like `pageCommands`: the sheet is mounted by the
 * frame, beside the page rather than above it.
 */

import { useEffect, useSyncExternalStore } from "react";

export interface PageShortcut {
  /** What it does, e.g. "Add to the suggested deal". */
  label: string;
  /** The keys, as drawn: ["j"], ["Enter"]. */
  keys: string[];
}

let current: readonly PageShortcut[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly PageShortcut[]) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NONE: readonly PageShortcut[] = [];

export function usePageShortcutList(): readonly PageShortcut[] {
  return useSyncExternalStore(subscribe, () => current, () => NONE);
}

/** List `shortcuts` on the Help sheet while the calling page is mounted. */
export function usePageShortcuts(shortcuts: readonly PageShortcut[]): void {
  const key = JSON.stringify(shortcuts);
  useEffect(() => {
    const mine = JSON.parse(key) as PageShortcut[];
    publish(mine);
    return () => {
      if (current === mine) publish(NONE);
    };
  }, [key]);
}
