"use client";

/**
 * Commands a page adds to the ⌘K palette while it is on screen: a proposal's
 * own pages and actions, which no menu lists ("Present this", "Version
 * history"). The page registers them; the palette shows them first, under the
 * page's own group.
 *
 * A module-level store rather than a context: the palette is mounted by the
 * frame, beside the page rather than above it, and the present screens have no
 * frame at all.
 */

import { useEffect, useSyncExternalStore } from "react";

export interface PageCommand {
  id: string;
  label: string;
  /** The palette group, e.g. "This proposal". */
  group: string;
  keywords?: string;
  hint?: string;
  /** Where it goes. */
  href: string;
}

let current: readonly PageCommand[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly PageCommand[]) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NONE: readonly PageCommand[] = [];

/** The commands of the page on screen. */
export function usePageCommandList(): readonly PageCommand[] {
  return useSyncExternalStore(subscribe, () => current, () => NONE);
}

/**
 * Offer `commands` in the palette while the calling page is mounted. Compared
 * by content, so a page that rebuilds the same list on every render does not
 * churn the palette.
 */
export function usePageCommands(commands: readonly PageCommand[]): void {
  const key = JSON.stringify(commands);
  useEffect(() => {
    const mine = JSON.parse(key) as PageCommand[];
    publish(mine);
    return () => {
      if (current === mine) publish(NONE);
    };
  }, [key]);
}
