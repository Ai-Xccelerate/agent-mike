"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The layout system's wide screen: from here a list page opens its preview
 * pane beside the list. The same width as `--breakpoint-wide` in globals.css,
 * so the CSS (`wide:`) and the components that render differently agree.
 */
export const WIDE_QUERY = "(min-width: 1600px)";

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * Read through `useSyncExternalStore`, so there is no "first render says no,
 * the effect says yes" flash. On the server -- and in a test, whose stubbed
 * `matchMedia` matches nothing -- it is `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener?.("change", onChange);
      return () => list.removeEventListener?.("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** Whether the screen is wide enough for a list's preview pane. */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
