"use client";

/**
 * The sidebar's Search: a field-shaped button that opens the ⌘K palette.
 *
 * The Artifacts frontend draws this inline in `AppSidebar` since its header bar
 * went (2026-09-30); it is a component of its own here, under the name it had
 * in the header, so every product's sidebar can open its palette the same way.
 * Same classes, same keycaps, same 44px target on a phone.
 */

import { useSyncExternalStore } from "react";

import { OPEN_PALETTE_EVENT } from "@/components/common/CommandPalette";
import { SearchIcon } from "@/components/common/icons";
import { modifierLabel } from "@/layout/shortcuts";

const noop = () => () => {};

export default function SearchTrigger({
  showLabels = true,
  onOpen,
  className = "mt-3",
}: {
  /** False on the collapsed rail: the magnifier alone, named by its label. */
  showLabels?: boolean;
  /** Run first -- on a phone, the drawer gets out of the palette's way. */
  onOpen?: () => void;
  /**
   * Its space above. 12px as the first control under the workspace, where the
   * engine's New sits; 8px once a New deal button stands above it, as Search
   * does under New in the engine.
   */
  className?: string;
}) {
  // The server cannot know the keyboard, so it draws "Ctrl" and the browser
  // corrects it to "⌘" on a Mac as it hydrates.
  const modifier = useSyncExternalStore(noop, modifierLabel, () => "Ctrl");

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
      }}
      aria-label="Search and commands"
      aria-keyshortcuts="Control+K Meta+K"
      className={`focus-ring ${className} flex h-9 shrink-0 items-center gap-2 max-sm:h-11 rounded-lg border border-gray-200 bg-white text-left text-theme-sm text-gray-500 shadow-theme-xs transition-colors duration-150 ease-out hover:border-gray-300 hover:text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400 dark:hover:border-white/[0.14] dark:hover:text-gray-200 ${
        showLabels ? "px-2.5" : "justify-center px-0"
      }`}
    >
      <SearchIcon className="size-4" />
      {showLabels ? (
        <>
          <span className="flex-1">Search</span>
          {/* No keycaps on a phone, which has neither key. Hidden by a wrapper:
              `.kbd`'s inline-flex would otherwise win over `hidden`. */}
          <span className="flex items-center gap-1 max-sm:hidden" aria-hidden="true">
            <span className="kbd">{modifier}</span>
            <span className="kbd">K</span>
          </span>
        </>
      ) : null}
    </button>
  );
}
