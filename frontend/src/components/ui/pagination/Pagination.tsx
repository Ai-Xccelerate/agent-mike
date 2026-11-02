"use client";

/**
 * A pager by page number (LIB-PAGINATION): where you are, the pages either
 * side, and the first and last. For a list with a row count and rows per page,
 * use `components/page/Pagination` (`Pagination` + `PageRange`), which says
 * "26–50 of 47" and offers the size.
 *
 * The current page is a raised white pill, in ink -- where you are, not an
 * action, so not orange. The rest are quiet until hovered.
 */

import React from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/common/icons";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPrevNext?: boolean;
  variant?: "default" | "compact";
  /** What is paged, for the control's name: "Pages of invoices". */
  label?: string;
  className?: string;
}

/** The first, the last, and the current page with its neighbours; five in a row near either end. */
function pagesToShow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((n) => shown.add(n));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((n) => shown.add(n));
  const sorted = [...shown].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

const STEP =
  "focus-ring inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2.5 text-theme-sm font-medium text-gray-700 transition-colors duration-150 ease-out hover:bg-gray-900/[0.05] hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent max-sm:h-11 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white dark:disabled:text-gray-500";

const PAGE =
  "focus-ring inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-theme-sm font-medium tabular-nums transition-colors duration-150 ease-out";
const PAGE_ON =
  "bg-white text-gray-900 shadow-theme-xs ring-1 ring-gray-200 dark:bg-white/[0.08] dark:text-white dark:ring-white/[0.08]";
const PAGE_OFF =
  "text-gray-600 hover:bg-gray-900/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white";

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  showPrevNext = true,
  variant = "default",
  label = "Pagination",
  className = "",
}) => {
  const goTo = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  };

  const previous = (
    <button type="button" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} className={STEP} aria-label="Previous page">
      <ChevronLeftIcon className="size-4" />
      <span className={variant === "compact" ? "" : "max-sm:sr-only"}>Previous</span>
    </button>
  );
  const next = (
    <button type="button" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} className={STEP} aria-label="Next page">
      <span className={variant === "compact" ? "" : "max-sm:sr-only"}>Next</span>
      <ChevronRightIcon className="size-4" />
    </button>
  );

  if (variant === "compact") {
    return (
      <nav aria-label={label} className={`flex items-center gap-1 ${className}`}>
        {previous}
        <span className="px-2 text-theme-sm tabular-nums text-gray-600 dark:text-gray-400" aria-live="polite">
          Page <span className="font-medium text-gray-900 dark:text-white">{currentPage}</span> of {totalPages}
        </span>
        {next}
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={`flex flex-wrap items-center gap-1 ${className}`}>
      {showPrevNext && previous}
      <ol className="flex flex-wrap items-center gap-0.5">
        {pagesToShow(currentPage, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-theme-sm text-gray-500 dark:text-gray-400">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                onClick={() => goTo(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === currentPage ? "page" : undefined}
                className={`${PAGE} ${entry === currentPage ? PAGE_ON : PAGE_OFF}`}
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ol>
      {showPrevNext && next}
    </nav>
  );
};

export default Pagination;
