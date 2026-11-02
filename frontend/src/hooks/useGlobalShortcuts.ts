"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSidebar } from "@/context/SidebarContext";
import { endChord, inChord, startChord } from "@/layout/chord";
import { GO_TO } from "@/layout/navigation";
import { FOCUS_SEARCH_EVENT, isTypingTarget, OPEN_SHORTCUTS_EVENT } from "@/layout/shortcuts";
import { toggleReferenceIds } from "@/components/common/ReferenceOverlayToggle";

/** `g` then a letter: go to a place, as in Linear and GitHub (the registry's `key`s). */
export { GO_TO };

/**
 * The frame's single-key shortcuts: `?` this help, `[` the sidebar, `/` the
 * page's own search, `\` the reference IDs, and `g` + a letter to go
 * somewhere -- the same keys Artifacts and Persuade answer to.
 *
 * Every one of them stands down while the person is typing (see
 * `isTypingTarget`) or when the key is part of a chord, and none prevents the
 * default unless it acted -- a shortcut layer that swallowed keys it did not use
 * would break the browser's own.
 */
export function useGlobalShortcuts() {
  const { toggleSidebar } = useSidebar();
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event)) return;
      // A dialog owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (inChord()) {
        endChord();
        const place = GO_TO.find((entry) => entry.key === event.key);
        if (place) {
          event.preventDefault();
          router.push(place.path);
          return;
        }
      }
      endChord();
      if (event.key === "g" && !event.shiftKey) {
        // The second key is read by the next press; a list's own keys stand
        // down for it (`inChord`, in `useListKeys`).
        event.preventDefault();
        startChord();
      } else if (event.key === "?") {
        event.preventDefault();
        window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
      } else if (event.key === "[") {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key === "\\") {
        event.preventDefault();
        toggleReferenceIds();
      } else if (event.key === "/") {
        // Only claimed when a page has a search box listening for it; the
        // event is cancelable so the listener can say it took it.
        const claim = new Event(FOCUS_SEARCH_EVENT, { cancelable: true });
        window.dispatchEvent(claim);
        if (claim.defaultPrevented) event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, router]);
}
