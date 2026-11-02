"use client";

/**
 * Pages of a list: where you are ("26–50 of 47"), the way to the pages either
 * side and to any page by number, and how many rows a page holds.
 *
 * Two shapes from one set of facts, because a list needs both: the compact
 * range in its sticky bar (`PageRange`), always in reach however far down the
 * page someone has scrolled, and the full row under the list (`Pagination`),
 * where the eye ends up after the last row. Numbers appear when the API has
 * counted the rows (`total`); a list that cannot count still pages, by
 * previous and next.
 */

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/common/icons";
import ChipMenu from "@/components/ui/ChipMenu";
import { PAGE_SIZES, type PageSize } from "@/hooks/useListParams";

export interface PageFacts {
  /** 1-based. */
  page: number;
  size: PageSize;
  /** Rows matching the filters, when the API counted them. */
  total: number | null | undefined;
  /** Rows on this page. */
  count: number;
  /** Whether there is a next page when there is no total (the cursor said so). */
  hasNext?: boolean;
}

/** The last page, or null when the total is unknown. */
export function lastPage({ size, total }: Pick<PageFacts, "size" | "total">): number | null {
  if (total === null || total === undefined) return null;
  return Math.max(1, Math.ceil(total / size));
}

export function canGoNext(facts: PageFacts): boolean {
  const last = lastPage(facts);
  return last === null ? Boolean(facts.hasNext) : facts.page < last;
}

/** "26–50 of 47"; "26–50" without a total; "0 of 0" for none. */
export function rangeLabel({ page, size, total, count }: PageFacts): string {
  if (count === 0) return total ? `0 of ${total.toLocaleString("en-US")}` : "0";
  const first = (page - 1) * size + 1;
  const last = first + count - 1;
  const span = `${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")}`;
  return total === null || total === undefined ? span : `${span} of ${total.toLocaleString("en-US")}`;
}

/**
 * The page numbers to draw: the first, the last, and the current one with its
 * neighbours, with a gap where pages are skipped. Seven or fewer pages: all.
 */
export function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  // Near either end, keep five in a row so the control does not jump about.
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
  "focus-ring inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2.5 text-theme-sm font-medium text-gray-700 transition-colors duration-150 ease-out hover:bg-gray-900/[0.05] hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent max-sm:h-11 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white dark:disabled:text-gray-400";

/** The compact range for a list's sticky bar: "1–25 of 47 ‹ ›". */
export function PageRange({
  facts,
  onPage,
  label,
}: {
  facts: PageFacts;
  onPage: (page: number) => void;
  /** What the rows are, for the buttons' names: "deals". */
  label: string;
}) {
  const next = canGoNext(facts);
  // An empty list has nothing to range over: no bare "0" with two dead arrows
  // above its empty state (an old link past the end still shows "0 of 47").
  if (facts.count === 0 && !facts.total && facts.page <= 1) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="whitespace-nowrap px-1 text-theme-sm tabular-nums text-gray-600 dark:text-gray-400" aria-live="polite">
        {rangeLabel(facts)}
      </span>
      <button
        type="button"
        className={`${STEP} w-9 px-0 max-sm:w-11`}
        aria-label={`Previous page of ${label}`}
        disabled={facts.page <= 1}
        onClick={() => onPage(facts.page - 1)}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <button
        type="button"
        className={`${STEP} w-9 px-0 max-sm:w-11`}
        aria-label={`Next page of ${label}`}
        disabled={!next}
        onClick={() => onPage(facts.page + 1)}
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

/** The full row under a list: range, pages, and rows per page. */
export function Pagination({
  facts,
  onPage,
  onSize,
  label,
  className = "",
}: {
  facts: PageFacts;
  onPage: (page: number) => void;
  onSize?: (size: PageSize) => void;
  /** What the rows are: "deals", "meetings". */
  label: string;
  className?: string;
}) {
  const last = lastPage(facts);
  const next = canGoNext(facts);
  const single = facts.page === 1 && !next;
  // One page and no choice of size worth offering: nothing to page through.
  if (single && (facts.total ?? facts.count) <= PAGE_SIZES[0]) return null;

  return (
    <nav
      aria-label={`Pages of ${label}`}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${className}`}
    >
      <p className="text-theme-sm tabular-nums text-gray-600 dark:text-gray-400">
        <span className="font-medium text-gray-800 dark:text-gray-200">{rangeLabel(facts)}</span> {label}
      </p>
      <div className="flex items-center gap-1 max-sm:order-last max-sm:w-full max-sm:justify-between">
        <button type="button" className={STEP} disabled={facts.page <= 1} onClick={() => onPage(facts.page - 1)} aria-label="Previous page">
          <ChevronLeftIcon className="size-4" />
          <span className="max-sm:sr-only">Previous</span>
        </button>
        {last !== null ? (
          <ol className="flex items-center gap-0.5 max-sm:hidden">
            {pageWindow(facts.page, last).map((entry, index) =>
              entry === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-theme-sm text-gray-500 dark:text-gray-400">
                  …
                </li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    onClick={() => onPage(entry)}
                    aria-label={`Page ${entry}`}
                    aria-current={entry === facts.page ? "page" : undefined}
                    className={`focus-ring inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-theme-sm font-medium tabular-nums transition-colors duration-150 ease-out ${
                      entry === facts.page
                        ? "bg-white text-gray-900 shadow-theme-xs ring-1 ring-gray-200 dark:bg-white/[0.08] dark:text-white dark:ring-white/[0.08]"
                        : "text-gray-600 hover:bg-gray-900/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                    }`}
                  >
                    {entry}
                  </button>
                </li>
              ),
            )}
          </ol>
        ) : null}
        {last !== null ? (
          <span className="px-2 text-theme-sm tabular-nums text-gray-600 sm:hidden dark:text-gray-400">
            Page {facts.page} of {last}
          </span>
        ) : null}
        <button type="button" className={STEP} disabled={!next} onClick={() => onPage(facts.page + 1)} aria-label="Next page">
          <span className="max-sm:sr-only">Next</span>
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      {onSize ? (
        <div className="flex items-center gap-2 text-theme-sm text-gray-600 dark:text-gray-400">
          <span aria-hidden="true" className="max-sm:hidden">
            Rows per page
          </span>
          <ChipMenu<string>
            label="Rows per page"
            size="sm"
            align="end"
            placement="above"
            value={String(facts.size)}
            onChange={(value) => onSize(Number(value) as PageSize)}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          />
        </div>
      ) : null}
    </nav>
  );
}
