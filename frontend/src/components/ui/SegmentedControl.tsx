"use client";

/**
 * One value from a few, drawn as a track with the chosen segment raised.
 *
 * Used for the library's kinds (All 10 · Decks 3 · ...), the templates page's
 * kinds, the create page's wording and the editor's device switch. A radio
 * group, because it is one value with several states: arrows move between
 * segments and choose as they go, the way native radios do, and only the chosen
 * segment is in the tab order.
 *
 * A count is optional and quieter than its label; it is read as part of the
 * segment's name ("Decks, 3").
 */

import { useRef } from "react";

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number | null;
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  value: T;
  segments: Array<Segment<T>>;
  onChange: (value: T) => void;
  /** Stretch the segments to fill the width, for a form row. */
  full?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Below `sm` the icons go, so four labelled kinds fit a phone's width. */
  compactIcons?: boolean;
}

export default function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  segments,
  onChange,
  full = false,
  size = "md",
  className = "",
  compactIcons = false,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );

  const move = (next: number) => {
    const bounded = (next + segments.length) % segments.length;
    onChange(segments[bounded].value);
    refs.current[bounded]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`${full ? "flex" : "inline-flex"} max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-gray-900/[0.06] p-[3px] no-scrollbar dark:bg-white/[0.06] ${className}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(index + 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(index - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(segments.length - 1);
        }
      }}
    >
      {segments.map((segment, at) => {
        const on = segment.value === value;
        return (
          <button
            key={segment.value}
            ref={(node) => {
              refs.current[at] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            // The visible text runs label and count together ("Decks3") for a
            // screen reader; the name keeps the pause the eye sees.
            aria-label={segment.count != null ? `${segment.label}, ${segment.count}` : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(segment.value)}
            className={`focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-theme-sm font-medium ${compactIcons ? "max-sm:px-2.5" : ""} transition-colors duration-150 ease-out ${
              size === "sm" ? "h-7" : "h-[34px] max-sm:h-11"
            } ${full ? "flex-1" : ""} ${
              on
                ? "bg-white text-gray-900 shadow-theme-xs dark:bg-white/[0.12] dark:text-white"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            }`}
          >
            {segment.icon ? (
              <span
                className={`${on ? "text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"} ${
                  compactIcons ? "max-sm:hidden" : ""
                }`}
              >
                {segment.icon}
              </span>
            ) : null}
            {segment.label}
            {segment.count != null ? (
              /* gray-600: on the track's grey, gray-500 is 4.0:1 -- under AA for
                 text this small. */
              <span className="text-theme-xs tabular-nums text-gray-600 dark:text-gray-400">
                {segment.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
