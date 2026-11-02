"use client";

/**
 * Cards side by side, lined up (LIB-PANELS): the rules every page that puts
 * cards next to each other follows, written once so a page cannot get them
 * wrong. From the Persuade frontend, where Home was two independent stacks of
 * cards (masonry): each column as tall as its own content, so card edges
 * zigzagged, a card ended above its neighbour, and a short column left a hole
 * beside a long one. These rules make that shape impossible to write rather
 * than something each page tunes away:
 *
 * 1. **Explicit rows on a 12-column grid** (`Row`). A row's cells are its
 *    children, each with a `span` (of 12, at full width). The spans always add
 *    up to twelve -- a row that falls short gives the rest to its last cell, so
 *    a card left out (no approvals today) widens its neighbour instead of
 *    leaving a hole. Narrower rows (the row's own width, a container query, so
 *    a collapsed sidebar or a rail beside it counts): two to a line from 48rem,
 *    where a cell alone on its line takes the whole line; one to a line below.
 * 2. **Cards in a row share its height.** Every cell stretches to the row's
 *    height and the card in it fills the cell. There is no `items-start`.
 * 3. **One card anatomy** (`Panel`): a head of fixed height (the title, its
 *    count, one link on the right), an optional toolbar (tabs), the body, and
 *    an optional foot pinned to the bottom -- so titles, counts, "See all" and
 *    pagers line up across a row, whatever each card holds.
 * 4. **Lists are bounded** (`PanelList`): at most `max` rows, and with `fit`
 *    only the rows that fit the height the row gives the card -- the list does
 *    not make the row taller (at full width it is size-contained), it fills
 *    it. What does not fit is behind the foot: "See all 46" to the full list,
 *    or a pager through the rows in place. A list never grows its card.
 * 5. **Several cards in one cell** (`Stack`) end on the cell's bottom: the one
 *    marked `grow` takes what the others leave. So every column of a
 *    composition ends on the same baseline -- a column of three cards beside
 *    one tall list ends where the list does, never above it.
 * 6. **Empty is calm** (`PanelEmpty`): an icon and one line, centred in the
 *    card both ways.
 * 7. **Tiles** (`Tiles`): cards of one kind (settings places, connections,
 *    offerings) in equal columns that never leave the last line part empty --
 *    its tiles widen to share it.
 * 8. **Summary facts are a band** (`FactBand`), not a rail: counts, totals,
 *    domains, last activity, in a line of equal-height fact cards across the
 *    page, above the list -- which then takes the full width at its own
 *    height. A side column is kept only for a working tool (a preview pane,
 *    a form, a search, the deal's actions), and it is capped to its main
 *    column's height and scrolls within it (`MainRail`): a short list is never
 *    stretched, or padded, to meet a long rail.
 *
 * Radius, border, padding, gaps and head heights are these components' alone:
 * a page composes them and does not restyle them.
 */

import Link from "next/link";
import { Children, Fragment, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/common/icons";
import { Skeleton } from "@/components/common/shared";

/* ------------------------------------------------------------ the spans */

/** A cell's width at full width, in twelfths. */
export type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Where each cell sits at each width: `half` from 48rem, `full` from 64rem (the row's own width). */
export type CellSpans = { full: Span; half: 6 | 12 };

/**
 * The spans of a row's cells, at both widths. `asked` is each cell's `span`
 * (undefined: an equal share). At full width they add up to exactly twelve:
 * a row that asks for less gives the rest to its last cell, one that asks for
 * more is shared out equally instead (and says so while developing). Two to
 * a line from 48rem: a cell wider than half a row takes the line, and a cell
 * that would sit alone on a line takes it too -- never a hole beside it.
 */
export function rowSpans(asked: Array<number | undefined>): CellSpans[] {
  const n = asked.length;
  if (!n) return [];
  const equal = equalShares(n);
  let full: number[] = asked.map((span, index) => (span && span >= 1 && span <= 12 ? Math.round(span) : equal[index]));
  const sum = full.reduce((a, b) => a + b, 0);
  if (sum > 12) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`Row: the spans ${JSON.stringify(asked)} add up to ${sum}, more than 12; sharing the row equally.`);
    }
    full = equal;
  } else if (sum < 12) {
    full[n - 1] += 12 - sum;
  }
  const half: Array<6 | 12> = full.map((span) => (span > 6 || n === 1 ? 12 : 6));
  // A half-width cell alone on its line takes the line.
  let run: number[] = [];
  const close = () => {
    if (run.length % 2 === 1) half[run[run.length - 1]] = 12;
    run = [];
  };
  half.forEach((span, index) => (span === 6 ? run.push(index) : close()));
  close();
  return full.map((span, index) => ({ full: span as Span, half: half[index] }));
}

/** Twelve shared among `n` as evenly as whole twelfths allow, the larger shares first. */
function equalShares(n: number): number[] {
  const base = Math.floor(12 / n);
  const extra = 12 - base * n;
  return Array.from({ length: n }, (_, index) => base + (index < extra ? 1 : 0));
}

// Written out whole so Tailwind sees every class.
const FULL_SPAN: Record<Span, string> = {
  1: "@5xl/row:col-span-1",
  2: "@5xl/row:col-span-2",
  3: "@5xl/row:col-span-3",
  4: "@5xl/row:col-span-4",
  5: "@5xl/row:col-span-5",
  6: "@5xl/row:col-span-6",
  7: "@5xl/row:col-span-7",
  8: "@5xl/row:col-span-8",
  9: "@5xl/row:col-span-9",
  10: "@5xl/row:col-span-10",
  11: "@5xl/row:col-span-11",
  12: "@5xl/row:col-span-12",
};
const HALF_SPAN: Record<6 | 12, string> = { 6: "@3xl/row:col-span-6", 12: "@3xl/row:col-span-12" };

/** A cell's classes: one to a line, then its half and full spans. */
export function cellClass(spans: CellSpans): string {
  return `col-span-12 ${HALF_SPAN[spans.half]} ${FULL_SPAN[spans.full]}`;
}

/* ------------------------------------------------------------- the rows */

const CellContext = createContext<CellSpans | null>(null);
const StackContext = createContext(false);

/** The rows of a composition, one above the other at the system's gap. */
export function Rows({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-6 ${className}`}>{children}</div>;
}

/**
 * One row of a composition. Its children are its cells -- a `Panel`, a
 * `Stack`, or anything that fills its cell -- each with an optional `span`
 * (twelfths, at full width). Children left out (`null`, `false`) are not
 * cells; the others share the row (see `rowSpans`).
 */
export function Row({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  const cells = Children.toArray(children).filter(isValidElement) as Array<React.ReactElement<{ span?: number }>>;
  const spans = rowSpans(cells.map((cell) => cell.props.span));
  const row = useRef<HTMLDivElement>(null);
  // A cell whose component drew nothing is a hole the spans cannot see: decide
  // whether a card is there at the row (`{x ? <Card /> : null}`), not inside it.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !row.current) return;
    const empty = Array.from(row.current.children).filter((cell) => !cell.firstElementChild).length;
    if (empty) console.error(`Row: ${empty} cell(s) drew nothing and leave a hole; leave the card out at the row instead.`);
  });
  return (
    <div
      ref={row}
      role={label ? "group" : undefined}
      aria-label={label}
      data-row=""
      // The row is the container its cells ask about, so they lay out by the row's
      // own width: beside a rail, under a collapsed sidebar, on a wide screen.
      className={`@container/row grid grid-cols-12 gap-6 ${className}`}
    >
      {cells.map((cell, index) => (
        // A flex column whose child fills it: whatever the cell holds is as tall as the row.
        <div key={cell.key ?? index} data-cell="" className={`flex min-w-0 flex-col *:flex-1 ${cellClass(spans[index])}`}>
          <CellContext.Provider value={spans[index]}>{cell}</CellContext.Provider>
        </div>
      ))}
    </div>
  );
}

/**
 * Several cards in one cell, ending on the cell's bottom: the card marked
 * `grow` takes the height the others leave (a fitted list, so it shows more
 * rows rather than leaving a gap). Where the cell has a line to itself at the
 * row's middle width, the cards sit two abreast instead of in a tall column.
 */
export function Stack({ children, className = "" }: { children: React.ReactNode; span?: number; className?: string }) {
  const cell = useContext(CellContext);
  const abreast = cell?.half === 12 && cell.full < 12;
  return (
    <div
      data-stack=""
      className={`flex min-h-0 flex-1 flex-col gap-6 ${abreast ? "@3xl/row:grid @3xl/row:grid-cols-2 @5xl/row:flex" : ""} ${className}`}
    >
      <StackContext.Provider value>{children}</StackContext.Provider>
    </div>
  );
}

/* ------------------------------------------------------------ the card */

/**
 * The card: head (title, count, one link on the right), an optional toolbar,
 * the body, an optional foot pinned to the bottom. It fills its cell; in a
 * `Stack`, the one with `grow` fills what the others leave.
 */
export function Panel({
  id,
  title,
  count,
  action,
  toolbar,
  foot,
  grow = false,
  scroll = false,
  children,
  className = "",
  as: Tag = "section",
  aixId,
}: {
  /** The heading's id is `${id}-heading`; the card is the region it names. */
  id: string;
  /** Its reference ID (`data-aix-id`), e.g. "AIX-020.2". */
  aixId?: string;
  title: React.ReactNode;
  /** How many there are in all, beside the title. */
  count?: number | null;
  /** The one link (or quiet control) on the right of the head. */
  action?: React.ReactNode;
  /** Under the head, above the body: the card's tabs or filter. */
  toolbar?: React.ReactNode;
  /** Pinned to the bottom. A `PanelList` draws its own. */
  foot?: React.ReactNode;
  /** In a `Stack`: take the height the other cards leave. */
  grow?: boolean;
  /**
   * A tool beside a column of cards (a setup guide): at full width the body
   * adds nothing to the row's height -- the cards beside it set it -- and
   * scrolls within it. Narrower, it takes its own height.
   */
  scroll?: boolean;
  /** Read by `Row`: twelfths at full width. */
  span?: number;
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  const stacked = useContext(StackContext);
  const fill = stacked ? (grow ? "min-h-0 flex-1" : "shrink-0") : "min-h-0 flex-1";
  return (
    <Tag
      aria-labelledby={`${id}-heading`}
      data-panel=""
      data-aix-id={aixId}
      className={`animate-rise flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03] ${fill} ${className}`}
    >
      <div data-panel-head="" className={PANEL_HEAD}>
        <h2 id={`${id}-heading`} className="flex min-w-0 items-baseline gap-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
          <span className="truncate">{title}</span>
          {count !== null && count !== undefined ? (
            <span className="shrink-0 text-theme-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{count.toLocaleString("en-US")}</span>
          ) : null}
        </h2>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {toolbar ? <div className="shrink-0 px-4 pt-3 sm:px-5">{toolbar}</div> : null}
      <div
        data-panel-body=""
        className={`flex min-h-0 flex-1 flex-col ${scroll ? "custom-scrollbar @5xl/row:min-h-48 @5xl/row:overflow-y-auto @5xl/row:[contain:size]" : ""}`}
      >
        {children}
      </div>
      {foot ? <PanelFoot>{foot}</PanelFoot> : null}
    </Tag>
  );
}

/** The head every card has: one height, one padding, one rule under it. */
export const PANEL_HEAD =
  "flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 sm:px-5 dark:border-white/[0.06]";

/** The head's one link: "Inbox", "Board", "See all". */
export function PanelLink({ href, children, ...rest }: { href: string; children: React.ReactNode } & Omit<React.ComponentPropsWithoutRef<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      {...rest}
      className="focus-ring shrink-0 rounded text-theme-sm font-medium text-gray-600 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-white"
    >
      {children}
    </Link>
  );
}

/** A card's foot: pinned to the bottom, one height, a status on the left and the way on on the right. */
export function PanelFoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-panel-foot=""
      className={`mt-auto flex h-11 shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-4 text-theme-xs text-gray-500 sm:px-5 dark:border-white/[0.06] dark:text-gray-400 ${className}`}
    >
      {children}
    </div>
  );
}

/** Nothing here: an icon and one line (and at most one way to start), centred in the card both ways. */
export function PanelEmpty({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div data-panel-empty="" className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-xl bg-gray-900/[0.05] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
        >
          {icon}
        </span>
      ) : null}
      <p className="max-w-xs text-theme-sm text-gray-600 dark:text-gray-400">{children}</p>
      {action}
    </div>
  );
}

/** Rows while a card's content loads: the shape of what is coming. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex-1 space-y-3 p-4 sm:px-5">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the band */

/**
 * A page's summary facts, as a band across it: equal-height fact cards in one
 * line where there is room -- each at least 9rem, sharing the line -- and,
 * where there is not, wrapped into lines whose last cards widen to fill it,
 * so no line is part empty. A `<dl>`: each `Fact` is a term and its value.
 */
export function FactBand({
  label,
  children,
  className = "",
  aixId,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Its reference ID (`data-aix-id`). */
  aixId?: string;
}) {
  return (
    <section aria-label={label} data-aix-id={aixId} className={className}>
      <dl data-band="" className="flex flex-wrap gap-3">
        {children}
      </dl>
    </section>
  );
}

/** One fact in a `FactBand`: its label, its value, a line under it, and at most one link. */
export function FactCard({
  label,
  value,
  sub,
  action,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  /** A value that is an address or a domain. */
  mono?: boolean;
}) {
  return (
    <div
      data-fact=""
      className="animate-rise flex min-w-0 flex-1 basis-36 flex-col rounded-2xl border border-gray-200 bg-white px-4 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <dt className="truncate text-theme-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        {action ? <div className="shrink-0 text-theme-xs">{action}</div> : null}
      </div>
      <dd
        className={`mt-1 min-w-0 truncate text-gray-900 dark:text-white ${
          mono ? "font-mono text-[15px]" : "font-display text-xl font-semibold tabular-nums tracking-tight"
        }`}
      >
        {value}
      </dd>
      {sub ? <dd className="mt-0.5 text-theme-xs leading-snug text-gray-500 dark:text-gray-400">{sub}</dd> : null}
    </div>
  );
}

/* ------------------------------------------------------------ the lists */

/**
 * How many of a list's rows fit a box of `height`: the rows whose bottom is
 * inside it, counted from the first, at least one. `bottoms` are each row's
 * bottom edge from the box's top. No height (no layout yet, or none at all,
 * as in a test's DOM): every row.
 */
export function rowsThatFit(height: number, bottoms: number[]): number {
  if (!(height > 0) || !bottoms.length) return bottoms.length;
  let fits = 0;
  for (const bottom of bottoms) {
    if (bottom > height + 0.5) break;
    fits += 1;
  }
  return Math.max(1, fits);
}

// Written out whole so Tailwind sees them: a fitted list's least height at full width.
const FIT_MIN = {
  8: "@5xl/row:min-h-32",
  12: "@5xl/row:min-h-48",
  16: "@5xl/row:min-h-64",
  18: "@5xl/row:min-h-72",
  24: "@5xl/row:min-h-96",
} as const;

/**
 * A card's list: bounded, and never growing its card.
 *
 * - `max` rows on screen at most.
 * - `fit`: at full width the list is size-contained -- it adds nothing to the
 *   row's height but `fitMin` -- and shows the rows that fit the height the
 *   row gives it. Narrower, the cards are one or two to a line and the list
 *   takes its own height (up to `max`).
 * - What is not shown is behind the foot: with `all`, "See all {total}" to the
 *   full list (also whenever the API counts more than it sent); with `page`,
 *   a pager through every row in place, `max` (or as many as fit) a page.
 * - No rows: `empty`, centred.
 *
 * `children` draws one row (an `<li>`).
 */
export function PanelList<T>({
  items,
  total,
  max,
  fit = false,
  fitMin = 12,
  all,
  page = false,
  pageLabel = "rows",
  ordered = false,
  keyOf,
  children,
  empty,
  listClassName = "divide-y divide-gray-100 dark:divide-white/[0.05]",
}: {
  items: T[];
  total?: number | null;
  max?: number;
  fit?: boolean;
  fitMin?: keyof typeof FIT_MIN;
  all?: { href: string; label?: string };
  page?: boolean;
  /** What the pager pages through, for its buttons' names: "activity". */
  pageLabel?: string;
  ordered?: boolean;
  keyOf: (item: T) => string;
  children: (item: T, index: number) => React.ReactNode;
  empty: React.ReactNode;
  listClassName?: string;
}) {
  // Every row the API sent; `max` (and the fit) decide how many are on screen at once.
  const rows = items;
  const inAll = Math.max(total ?? 0, items.length);
  const box = useRef<HTMLDivElement>(null);
  // The first row of each page so far, so going back returns exactly where it was.
  const [starts, setStarts] = useState<number[]>([0]);
  const start = Math.min(starts[starts.length - 1], Math.max(0, rows.length - 1));
  // How many of this page's rows fit: `null` while every remaining row is drawn to be measured.
  const [fits, setFits] = useState<number | null>(null);
  // Whether the last measure left rows out. The foot follows it -- and only a
  // measure changes it, so the foot never comes and goes while measuring (it
  // takes room, which would change the answer).
  const [cutByFit, setCutByFit] = useState(false);
  const remaining = rows.length - start;
  const perPage = Math.min(remaining, max ?? Infinity);
  const shown = fit && fits !== null ? Math.min(fits, perPage) : perPage;
  const more = inAll > rows.length;
  const cut = start > 0 || perPage < remaining || (fit && cutByFit);
  const seeAll = Boolean(all && (more || cut));
  const paging = !seeAll && page && cut;

  // A change of the box's height that asks for a measure (see below).
  const [resized, setResized] = useState(0);

  // Before paint: how many of the drawn rows fit the box -- whenever the rows, the
  // page, the foot (it takes room) or the box's height change.
  useLayoutEffect(() => {
    if (!fit) return;
    const el = box.current;
    const list = el?.firstElementChild;
    if (!el || !list) return;
    const bottoms = Array.from(list.children, (row) => (row as HTMLElement).offsetTop + (row as HTMLElement).offsetHeight);
    const next = rowsThatFit(el.clientHeight, bottoms);
    if (next !== fits) setFits(next);
    // Measured over every remaining row: that decides whether any are left out.
    if (fits === null && (next < perPage) !== cutByFit) setCutByFit(next < perPage);
  }, [fit, fits, perPage, cutByFit, start, items, resized]);

  // When the box grows, rows that were left out may fit now: draw them all and measure
  // again. When it shrinks, measure the rows drawn: fewer fit.
  useLayoutEffect(() => {
    const el = box.current;
    if (!fit || !el || typeof ResizeObserver === "undefined") return;
    let last = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const height = el.clientHeight;
      if (height > last + 0.5) setFits(null);
      else if (height < last - 0.5) setResized((n) => n + 1);
      last = height;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  if (!rows.length) return <>{empty}</>;

  const List = ordered ? "ol" : "ul";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={box}
        data-panel-list=""
        className={`relative min-h-0 flex-1 ${fit ? `overflow-hidden @5xl/row:[contain:size] ${FIT_MIN[fitMin]}` : ""}`}
      >
        <List className={listClassName}>
          {rows.slice(start, start + shown).map((item, index) => (
            <Fragment key={keyOf(item)}>{children(item, start + index)}</Fragment>
          ))}
        </List>
      </div>
      {seeAll && all ? (
        <PanelFoot>
          <span className="tabular-nums">
            {(start + shown).toLocaleString("en-US")} of {inAll.toLocaleString("en-US")}
          </span>
          <Link
            href={all.href}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-theme-sm font-medium text-gray-700 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-white"
          >
            {all.label ?? `See all ${inAll.toLocaleString("en-US")}`}
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Link>
        </PanelFoot>
      ) : paging ? (
        <PanelFoot>
          <span className="tabular-nums">
            {start + 1}–{start + shown} of {rows.length}
          </span>
          <span className="flex items-center gap-1">
            <PageButton
              label={`Previous ${pageLabel}`}
              disabled={start === 0}
              onClick={() => {
                setFits(null);
                setStarts((now) => (now.length > 1 ? now.slice(0, -1) : now));
              }}
            >
              <ChevronLeftIcon className="size-4" />
            </PageButton>
            <PageButton
              label={`Next ${pageLabel}`}
              disabled={start + shown >= rows.length}
              onClick={() => {
                setFits(null);
                setStarts((now) => [...now, start + shown]);
              }}
            >
              <ChevronRightIcon className="size-4" />
            </PageButton>
          </span>
        </PanelFoot>
      ) : null}
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-900/[0.05] hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ the tiles */

/** Columns tiles take as their container widens: 2 from 42rem, 3 from 56rem, 4 from 80rem. */
const TILE_MODES = [2, 3, 4] as const;

const TILE_SPAN: Record<2 | 3 | 4, Record<number, string>> = {
  2: { 6: "@2xl/tiles:col-span-6", 12: "@2xl/tiles:col-span-12" },
  3: { 4: "@4xl/tiles:col-span-4", 6: "@4xl/tiles:col-span-6", 12: "@4xl/tiles:col-span-12" },
  4: { 3: "@7xl/tiles:col-span-3", 4: "@7xl/tiles:col-span-4", 6: "@7xl/tiles:col-span-6", 12: "@7xl/tiles:col-span-12" },
};

/**
 * Each tile's span (of 12) when `columns` are on offer for `count` tiles: an
 * equal share, the last line's tiles widened to share their line -- so the
 * last line is never part empty. Fewer tiles than columns share the line.
 */
export function tileSpans(count: number, columns: number): number[] {
  const cols = Math.max(1, Math.min(columns, count));
  const rest = count % cols;
  const base = 12 / cols;
  return Array.from({ length: count }, (_, index) => (rest && index >= count - rest ? 12 / rest : base));
}

/** Big tiles (an offering, a proposal at a glance): two to a line, from 72rem. */
const WIDE_SPAN: Record<number, string> = { 6: "@6xl/tiles:col-span-6", 12: "@6xl/tiles:col-span-12" };

/**
 * Cards of one kind in equal columns -- up to `max` -- that add columns as
 * their container widens (one to a line below 42rem), every tile in a line as
 * tall as the tallest, and the last line's tiles sharing it whole. `wide`
 * tiles hold a lot each: one to a line until 72rem, then two. `list` makes
 * it a list (`ul`, a tile an `li`); `stagger` has the tiles arrive in order
 * (each tile rises; the cards in them should not as well).
 */
export function Tiles({
  children,
  max = 4,
  wide = false,
  list = false,
  stagger = false,
  className = "",
}: {
  children: React.ReactNode;
  max?: 2 | 3 | 4;
  wide?: boolean;
  list?: boolean;
  stagger?: boolean;
  className?: string;
}) {
  const tiles = Children.toArray(children).filter(isValidElement);
  const modes = wide ? [] : TILE_MODES.filter((columns) => columns <= max);
  const spans = Object.fromEntries(modes.map((columns) => [columns, tileSpans(tiles.length, columns)])) as Record<number, number[]>;
  const wideSpans = tileSpans(tiles.length, 2);
  const Grid = list ? "ul" : "div";
  const Tile = list ? "li" : "div";
  return (
    <div className={`@container/tiles ${className}`}>
      <Grid data-tiles="" className={`grid grid-cols-12 gap-4 ${stagger ? "stagger" : ""}`}>
        {tiles.map((tile, index) => (
          <Tile
            key={tile.key ?? index}
            data-tile=""
            style={stagger ? ({ "--i": index } as React.CSSProperties) : undefined}
            className={`col-span-12 flex min-w-0 flex-col *:flex-1 ${stagger ? "animate-rise" : ""} ${
              wide ? WIDE_SPAN[wideSpans[index]] : modes.map((columns) => TILE_SPAN[columns][spans[columns][index]]).join(" ")
            }`}
          >
            {tile}
          </Tile>
        ))}
      </Grid>
    </div>
  );
}
