"use client";

import React, { useId, useRef, useState } from "react";

export interface TabItem {
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  /**
   * `segmented` draws the tabs as the app's segmented track (SegmentedControl's
   * look) while keeping tab semantics: it switches a panel of content, which a
   * radio group does not.
   */
  variant?: "underline" | "pill" | "segmented";
  /** What the tabs choose between, for the tab list's accessible name. */
  label?: string;
  panelClassName?: string;
}

export default function Tabs({
  items,
  variant = "underline",
  label,
  panelClassName = "pt-4 text-sm text-gray-600 dark:text-gray-300",
}: TabsProps) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = (i: number) => `${baseId}-panel-${i}`;

  const choose = (next: number) => setActive(next);

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next = active;
    if (e.key === "ArrowRight") next = (active + 1) % items.length;
    else if (e.key === "ArrowLeft")
      next = (active - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    choose(next);
    tabRefs.current[next]?.focus();
  };

  const listClass =
    variant === "underline"
      ? // As wide as its tabs, inside a scroller (below): on a phone the row
        // scrolls on its own instead of pushing the page sideways.
        "flex min-w-max gap-1 border-b border-gray-200 dark:border-white/[0.08]"
      : variant === "segmented"
        ? // Wraps on a phone rather than hiding tabs off the edge of a scroller.
          "flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-gray-900/[0.06] p-[3px] sm:inline-flex dark:bg-white/[0.06]"
        : // Wraps rather than overflowing: six pills do not fit a phone's width.
          "inline-flex flex-wrap gap-1 rounded-lg bg-gray-900/[0.05] p-1 dark:bg-white/[0.06]";

  const tabClass = (i: number) => {
    const isActive = active === i;
    if (variant === "underline") {
      return `-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out focus-ring ${
        isActive
          ? // Ink, not orange: the selected tab is where you are, and orange
            // belongs to the page's one primary action (as `TabBar` draws it).
            "border-gray-900 text-gray-900 dark:border-white dark:text-white"
          : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      }`;
    }
    if (variant === "segmented") {
      // 44px tall on a phone, the touch target; 32px in the track elsewhere.
      return `focus-ring inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[7px] px-3 text-theme-sm font-medium transition-colors duration-150 ease-out sm:h-8 ${
        isActive
          ? "bg-white text-gray-900 shadow-theme-xs dark:bg-white/[0.12] dark:text-white"
          : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
      }`;
    }
    return `rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-ring ${
      isActive
        ? "bg-white text-gray-900 shadow-theme-xs dark:bg-white/10 dark:text-white"
        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
    }`;
  };

  return (
    <div>
      <div className={variant === "underline" ? "no-scrollbar overflow-x-auto" : undefined}>
        <div role="tablist" aria-label={label} className={listClass} onKeyDown={onKeyDown}>
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={active === i}
              aria-controls={panelId(i)}
              tabIndex={active === i ? 0 : -1}
              onClick={() => choose(i)}
              className={tabClass(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {items.map((item, i) => (
        <div
          key={item.label}
          role="tabpanel"
          id={panelId(i)}
          aria-labelledby={tabId(i)}
          hidden={active !== i}
          // Focusable because its first content is not (APG tabs), so the
          // focus has to be visible: it was outlined in nothing.
          tabIndex={0}
          className={`focus-ring rounded-lg ${panelClassName}`}
        >
          {active === i && item.content}
        </div>
      ))}
    </div>
  );
}
