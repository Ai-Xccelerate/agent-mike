"use client";

/**
 * Joined outline buttons (LIB-BUTTONGROUP): a few related actions in one
 * control, or a pressed/unpressed toggle among them.
 *
 * For "one value from a few" (a view, a period), prefer `SegmentedControl`:
 * it is a radio group with arrow keys. This is a row of buttons, each with
 * `aria-pressed` while it is the chosen one.
 *
 * Chosen is ink, not orange: a grey press, with the words darkening. The
 * accent belongs to the page's one primary action.
 */

import React, { useState } from "react";

export interface ButtonGroupItem {
  label: string;
  icon?: React.ReactNode;
}

interface ButtonGroupProps {
  items: ButtonGroupItem[];
  /** sm 36px, md 40px: the same heights as `Button`, so a group sits in a row of them. */
  size?: "sm" | "md";
  defaultActiveIndex?: number;
  activeIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  /**
   * False for a group of actions with no chosen one (Copy · Share · Export):
   * no pressed state, no `aria-pressed`. True by default.
   */
  selectable?: boolean;
  /** What the group is, for its accessible name ("Period"). */
  ariaLabel?: string;
  /** Icons only: each label becomes the button's accessible name. */
  iconOnly?: boolean;
}

const ButtonGroup: React.FC<ButtonGroupProps> = ({
  items,
  size = "md",
  defaultActiveIndex = 0,
  activeIndex,
  onChange,
  className = "",
  selectable = true,
  ariaLabel,
  iconOnly = false,
}) => {
  const [internalActive, setInternalActive] = useState(defaultActiveIndex);
  const active = activeIndex ?? internalActive;

  const sizeClasses = {
    // Inside the group's 1px border, so the whole control is 36px / 40px.
    sm: `h-[34px] text-theme-sm ${iconOnly ? "w-[34px]" : "px-3"}`,
    md: `h-[38px] text-sm ${iconOnly ? "w-[38px]" : "px-3.5"}`,
  };

  const handleClick = (index: number) => {
    if (activeIndex === undefined) setInternalActive(index);
    onChange?.(index);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // A border, not an inset ring: a chosen button's fill would paint over a ring.
      className={`inline-flex max-w-full divide-x divide-gray-300 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-theme-xs dark:divide-gray-700 dark:border-gray-700 dark:bg-white/[0.03] ${className}`}
    >
      {items.map((item, index) => {
        const isActive = selectable && index === active;
        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            aria-pressed={selectable ? isActive : undefined}
            aria-label={iconOnly ? item.label : undefined}
            title={iconOnly ? item.label : undefined}
            onClick={() => handleClick(index)}
            // The ring is inset: the group clips its corners, so an offset ring would be cut off.
            className={`relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 ease-out focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-700 dark:focus-visible:ring-brand-400 ${
              sizeClasses[size]
            } ${
              isActive
                ? "bg-gray-100 text-gray-900 dark:bg-white/[0.1] dark:text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            {item.icon && (
              <span
                className={`flex items-center ${isActive ? "text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}
              >
                {item.icon}
              </span>
            )}
            {iconOnly ? null : item.label}
          </button>
        );
      })}
    </div>
  );
};

export default ButtonGroup;
