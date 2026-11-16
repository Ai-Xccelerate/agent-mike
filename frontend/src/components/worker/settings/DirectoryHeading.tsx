import type { ReactNode } from "react";
import { sectionTitleClass } from "@/components/worker/settings/ui";

/**
 * The heading above each block of the Connections page: a title, an optional count beside it, one line saying what
 * the block is, and a slot on the right for its own controls (a filter, a search box, an add button).
 */
export default function DirectoryHeading({
  id,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  title: string;
  /** Shown muted beside the title: "3", "0 of 7 on". */
  count?: ReactNode;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className={sectionTitleClass}>
          {title}
          {count !== undefined && <span className="ml-2 text-sm font-normal tabular-nums text-gray-500 dark:text-gray-400">{count}</span>}
        </h2>
        {hint && <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
