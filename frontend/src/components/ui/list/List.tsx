/**
 * A list of short lines in prose (LIB-LIST): bullets, steps, features, a
 * checklist. Markers are quiet grey -- a column of orange bullets is a dozen
 * orange moments -- except the checklist's ticks, which say "done" in green.
 *
 * For rows of things you can open (deals, people), use a divided list of
 * rows instead (see the List page's last block, or `PanelList`).
 */

import React from "react";

import { CheckIcon } from "@/components/common/icons";

export interface ListItem {
  text: React.ReactNode;
  icon?: React.ReactNode;
}

interface ListProps {
  items: ListItem[];
  variant?: "unordered" | "ordered" | "icon" | "check";
  className?: string;
}

const List: React.FC<ListProps> = ({ items, variant = "unordered", className = "" }) => {
  const baseItem = "text-theme-sm leading-relaxed text-gray-700 dark:text-gray-300";

  if (variant === "ordered") {
    return (
      <ol
        className={`list-decimal space-y-2.5 pl-5 marker:font-medium marker:tabular-nums marker:text-gray-500 dark:marker:text-gray-400 ${className}`}
      >
        {items.map((item, i) => (
          <li key={i} className={`pl-1 ${baseItem}`}>
            {item.text}
          </li>
        ))}
      </ol>
    );
  }

  if (variant === "unordered") {
    return (
      <ul className={`list-disc space-y-2.5 pl-5 marker:text-gray-400 dark:marker:text-gray-500 ${className}`}>
        {items.map((item, i) => (
          <li key={i} className={`pl-1 ${baseItem}`}>
            {item.text}
          </li>
        ))}
      </ul>
    );
  }

  // icon / check variants
  return (
    <ul className={`space-y-3 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full ${
              variant === "check"
                ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {variant === "check" ? <CheckIcon className="size-3.5" strokeWidth={2.25} /> : item.icon}
          </span>
          <span className={baseItem}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
};

export default List;
