"use client";

/**
 * The layout system (LIB-PAGESHELL): every page in an AIX product is one of
 * three shapes, so a new page inherits the frame, the bars, the breakpoints
 * and the spacing instead of drawing its own column. The same components the
 * Persuade frontend's pages are built from.
 *
 * - **`ListPage`** -- a head, a sticky bar of filters with the page range,
 *   the list, its pages; and on a wide screen (1600px and up) a preview pane
 *   beside the list for the row you are on. Leads (`/leads`) is the template's
 *   worked example.
 * - **`DetailPage`** -- a way back, a head, sticky tabs, then the tab's work
 *   beside a rail (the facts that stay true whichever tab you are on). A lead
 *   (`/leads/[id]`) is the worked example.
 * - **`GridPage`** -- a head and sections of cards in a grid that adds columns
 *   as the room grows. Home (`/`) is the worked example.
 *
 * Cards side by side follow one set of rules, in `Panels.tsx`: explicit rows
 * on twelve columns, every card in a row one height, one card anatomy, lists
 * that never grow their card, tiles that never leave a line part empty. Here,
 * the same rule for a main column beside its rail: the rail starts level with
 * the main column's first card and is capped to the main column's height,
 * scrolling within it, so a short list is never stretched to meet a long rail
 * and a long rail never hangs below a short list. Summary facts are not a rail
 * at all but a band across the top (`band`, a `FactBand`).
 *
 * Every page uses the content area's full width (the frame's gutter grows
 * with the screen). Measures stay readable by composition -- a list beside a
 * pane, a main column beside a rail, cards that wrap -- not by a page-wide
 * max-width. Breakpoints: phone (everything stacks), tablet (`md`), desktop
 * (`lg`/`xl`: rails appear, rows become one line), wide (`wide`, 1600px:
 * the preview pane, extra columns).
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useMediaQuery, useWide } from "@/hooks/useMediaQuery";
import { useStuck } from "@/hooks/useStuck";

import { Tiles } from "./Panels";

/* ------------------------------------------------------------ the bar */

/** The phone's top bar is 56px; from `lg` a page bar sticks to the very top. */
function useStickTop(): number {
  return useMediaQuery("(min-width: 1024px)") ? 0 : 56;
}

/**
 * A page's sticky bar: a list's filters and range, a detail page's tabs. Full
 * width through the gutter, the page's ground at rest and chrome once content
 * scrolls under it (`.page-bar` in globals.css).
 */
export function PageBar({
  children,
  label,
  className = "",
  aixId,
}: {
  children: React.ReactNode;
  /** Its landmark name, when it is a region of controls ("Filter deals"). */
  label?: string;
  className?: string;
  /**
   * Its reference ID (`data-aix-id`). Stamp it here, never on a wrapper: a
   * sticky bar only travels inside its parent, and a wrapper its own height
   * leaves it nowhere to stick.
   */
  aixId?: string;
}) {
  const top = useStickTop();
  const { sentinel, stuck } = useStuck(top);
  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div
        role={label ? "region" : undefined}
        aria-label={label}
        data-aix-id={aixId}
        data-stuck={stuck ? "" : undefined}
        // On a phone the filters take several lines: they scroll away with the
        // head there rather than hold a quarter of the screen.
        className={`page-bar sticky top-14 z-sticky -mt-px max-sm:static lg:top-0 ${className}`}
      >
        {children}
      </div>
    </>
  );
}

/** A list's toolbar row inside a `PageBar`: filters on the left, the range on the right. */
export function Toolbar({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-start gap-x-2.5 gap-y-2 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {/* Level with the first row of filters, should they take two. */}
      {end ? <div className="flex min-h-10 shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">{end}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- lists */

/** The fewest rows a list shows beside its preview pane. */
export const PREVIEW_ROWS = 3;

/**
 * `head` scrolls away; `bar` sticks; `children` is the list (with its own
 * empty, loading and error states); `footer` its pages. `preview` is drawn
 * only on a wide screen (the caller can ask `useWide()` before fetching what
 * it shows), beside the list and capped to its height -- and only beside a
 * list of three rows or more (`rows`): beside one or two it would be a long
 * panel against a short list, repeating the row, which opens the item anyway.
 */
export function ListPage({
  head,
  band,
  bar,
  above,
  children,
  footer,
  preview,
  previewLabel = "Preview",
  rows,
}: {
  head: React.ReactNode;
  /** The list's summary facts (a `FactBand`), under the head. */
  band?: React.ReactNode;
  bar?: React.ReactNode;
  /** Something the list's reader should know first: a note, a warning. */
  above?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  preview?: React.ReactNode;
  previewLabel?: string;
  /** How many rows the list shows: the preview needs three. */
  rows?: number;
}) {
  const wide = useWide();
  const pane = wide && preview && (rows === undefined || rows >= PREVIEW_ROWS) ? preview : null;
  return (
    <div className="flex w-full flex-1 flex-col">
      {head}
      {band ? <div className="mt-5">{band}</div> : null}
      {/* The bar is a child of the page's column itself, never of a wrapper
          its own height: a sticky element only travels inside its parent, and
          a wrapper as tall as the bar left it nowhere to stick. */}
      {bar ? (
        <>
          <div aria-hidden="true" className="mt-5" />
          {bar}
        </>
      ) : (
        <div className="mt-6" />
      )}
      {above ? <div className="mb-3 mt-1">{above}</div> : null}
      {/* The list at its own height; the pane beside it capped to it (`CappedRail`). */}
      <div className={pane ? "grid grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] gap-6 3xl:grid-cols-[minmax(0,1fr)_34rem]" : ""}>
        <div data-list-column="" className="min-w-0">
          {children}
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
        {pane ? (
          <CappedRail label={previewLabel} top="top-[4.75rem]" always>
            {pane}
          </CappedRail>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The card a list's rows sit in, with an optional column header that lines
 * up with the rows (`cols` is the grid template both use, written at the call
 * site so Tailwind sees it). `overflow-clip`, not `overflow-hidden`: the
 * corners are cut without making the card a scroll container, which would
 * stop anything inside it from sticking.
 *
 * The frame is a size container (`@container`): rows lay out by the list's
 * own width -- `@3xl:` one line, `@5xl:` every column -- so the same list
 * reads right on a laptop, beside the preview pane, and on a wide screen.
 *
 * It takes its rows' height -- never stretched to meet a rail -- and `end`, a
 * `ListEnd`, is its last row: the way to add to the list, one line high.
 */
export function ListFrame({
  children,
  header,
  end,
  className = "",
  busy = false,
  aixId,
}: {
  children: React.ReactNode;
  /** Its reference ID (`data-aix-id`). */
  aixId?: string;
  header?: React.ReactNode;
  /** The list's last row: a `ListEnd`. */
  end?: React.ReactNode;
  className?: string;
  busy?: boolean;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      data-aix-id={aixId}
      className={`@container flex flex-col overflow-clip rounded-2xl border border-gray-200 bg-white transition-opacity duration-150 ease-out dark:border-white/[0.06] dark:bg-white/[0.03] ${
        busy ? "opacity-70" : ""
      } ${className}`}
    >
      {header}
      {children}
      {end ? <div className="border-t border-gray-100 dark:border-white/[0.05]">{end}</div> : null}
    </div>
  );
}

/**
 * A list's last row: an icon, one short line and the way to add to the list
 * ("Add a source") -- one row high, at the list's foot, above its pages.
 */
export function ListEnd({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div data-list-end="" className="flex min-h-12 items-center gap-3 px-4 py-2 text-theme-sm text-gray-600 dark:text-gray-400">
      {icon ? (
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gray-900/[0.04] text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
          {icon}
        </span>
      ) : null}
      <p className="min-w-0 flex-1">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The column header row of a `ListFrame`, shown once the rows are one line
 * (`@3xl`): hidden from assistive tech, which reads each row's own labels.
 */
export function ColumnHead({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`hidden items-center gap-4 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-gray-500 @3xl:grid dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400 ${cols}`}
    >
      {children}
    </div>
  );
}

/** Rows while the first page loads: the shape of what is coming. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="overflow-clip rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-12 items-center gap-4 border-b border-gray-100 px-4 last:border-0 dark:border-white/[0.05]">
          <span className="h-3.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
          <span className="hidden h-3.5 w-24 animate-pulse rounded bg-gray-100 md:block dark:bg-white/[0.06]" />
          <span className="hidden h-3.5 w-20 animate-pulse rounded bg-gray-100 lg:block dark:bg-white/[0.06]" />
          <span className="ml-auto h-3.5 w-16 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- detail */

/**
 * A deal, a customer, a source: `back`, the head, sticky `tabs`, then the
 * page's work -- with a `rail` beside it (`MainRail`), or, when each tab has
 * a rail of its own, the tab draws its own `MainRail`.
 */
export function DetailPage({
  back,
  head,
  tabs,
  children,
  band,
  mainHead,
  mainHeadSlot = false,
  rail,
  railLabel = "About this",
  railFirst = false,
}: {
  back?: React.ReactNode;
  head: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  /** The page's summary facts (a `FactBand`), under the head and above the tabs: never a rail. */
  band?: React.ReactNode;
  /** The main column's own head (see `MainRail`). */
  mainHead?: React.ReactNode;
  /** Each tab draws its own head, into the main column's head (`MainRailHead`). */
  mainHeadSlot?: boolean;
  rail?: React.ReactNode;
  railLabel?: string;
  railFirst?: boolean;
}) {
  return (
    <div className="flex w-full flex-1 flex-col">
      {back ? <div className="mb-2.5">{back}</div> : null}
      {head}
      {band ? <div className="mt-5">{band}</div> : null}
      {/* A child of the column, not of a wrapper: see `ListPage`'s bar. */}
      {tabs ? (
        <>
          <div aria-hidden="true" className="mt-5" />
          {tabs}
        </>
      ) : null}
      <div className="mt-6">
        {rail ? (
          <MainRail head={mainHead} headSlot={mainHeadSlot} rail={rail} railLabel={railLabel} railFirst={railFirst}>
            {children}
          </MainRail>
        ) : (
          <>
            {mainHead ? <div className="mb-3">{mainHead}</div> : null}
            {children}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The work beside its rail. The rail is a column from `xl` (20rem; 24rem on a
 * wide screen), sticky under a page bar and scrolling on its own if it is
 * taller than the window; below `xl` it comes after the main column -- or
 * before it, with `railFirst`, when what it holds steers the main column (a
 * filter, a jump list).
 *
 * Side by side, the two line up:
 *
 * - **Tops.** `head` -- the main column's title and actions ("Sources 3",
 *   Add source) -- sits above the main column only, so the rail's first card
 *   starts level with the main column's first card, not with a line of text.
 *   Where the page keeps its frame and each tab has its own head (a
 *   customer's tabs), `headSlot` keeps that place and the tab draws into it
 *   with `MainRailHead`.
 * - **Bottoms.** The main column takes its own height; the rail is capped to
 *   it (never shorter than 12rem, so a tool stays usable) and scrolls within
 *   it, and beside a main column longer than the window it sticks. So a short
 *   list is never stretched to meet a long rail, and a long rail never hangs
 *   below a short list. A rail is for a working tool; summary facts go in a
 *   band (`DetailPage`'s `band`).
 */
export function MainRail({
  children,
  head,
  headSlot = false,
  rail,
  railLabel = "About this",
  railFirst = false,
}: {
  children: React.ReactNode;
  head?: React.ReactNode;
  headSlot?: boolean;
  rail: React.ReactNode;
  railLabel?: string;
  railFirst?: boolean;
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const headed = Boolean(head) || headSlot;
  return (
    <div
      data-main-rail=""
      className={`grid grid-cols-1 gap-x-6 xl:grid-cols-[minmax(0,1fr)_20rem] wide:grid-cols-[minmax(0,1fr)_24rem] 3xl:grid-cols-[minmax(0,1fr)_26rem] ${
        headed ? "gap-y-3 xl:grid-rows-[auto_1fr]" : "gap-y-6"
      }`}
    >
      {headed ? (
        <div ref={headSlot ? setSlot : undefined} className="min-w-0 xl:col-start-1 xl:row-start-1">
          {head}
        </div>
      ) : null}
      <div data-main="" className={`flex min-w-0 flex-col xl:col-start-1 ${headed ? "xl:row-start-2" : "xl:row-start-1"}`}>
        <HeadSlotContext.Provider value={headSlot ? { slot } : null}>{children}</HeadSlotContext.Provider>
      </div>
      <CappedRail
        label={railLabel}
        top="xl:top-[4.25rem]"
        className={`xl:col-start-2 ${headed ? `${railFirst ? "max-xl:mb-3" : "max-xl:mt-3"} xl:row-start-2` : "xl:row-start-1"} ${
          railFirst ? "max-xl:order-first" : ""
        }`}
      >
        {rail}
      </CappedRail>
    </div>
  );
}

/**
 * A side column capped to its row: it adds nothing to the row's height but
 * its floor (12rem: one rail card) -- the main column beside it sets it -- and its content
 * scrolls within that height, sticking under the page bar beside a main
 * column longer than the window. From `xl` (a rail), or `always` (a preview
 * pane, drawn only on a wide screen). While there is more below, its foot
 * fades (`data-more`), so a rail cut short says so.
 */
function CappedRail({
  label,
  top,
  always = false,
  className = "",
  children,
}: {
  label: string;
  top: string;
  always?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", check);
      observer?.disconnect();
    };
  }, []);
  return (
    <aside
      aria-label={label}
      data-capped-rail=""
      className={`min-w-0 ${always ? "min-h-48 [contain:size]" : "xl:min-h-48 xl:[contain:size]"} ${className}`}
    >
      <div
        ref={scroller}
        data-more={more ? "" : undefined}
        className={`custom-scrollbar data-more:[mask-image:linear-gradient(to_bottom,#000_calc(100%_-_3rem),transparent)] ${
          always ? `sticky ${top} max-h-[min(100%,calc(100dvh_-_6.5rem))] overflow-y-auto` : `xl:sticky ${top} xl:max-h-[min(100%,calc(100dvh_-_5.5rem))] xl:overflow-y-auto`
        }`}
      >
        <div className="space-y-4">{children}</div>
      </div>
    </aside>
  );
}

const HeadSlotContext = createContext<{ slot: HTMLDivElement | null } | null>(null);

/**
 * A tab's head, drawn into its `MainRail`'s head slot (`headSlot`), so the
 * rail starts level with the tab's first card while the page around the tab
 * stays as it is. Outside a slot it is drawn where it stands.
 */
export function MainRailHead({ children }: { children: React.ReactNode }) {
  const place = useContext(HeadSlotContext);
  if (!place) return <div className="mb-3">{children}</div>;
  return place.slot ? createPortal(children, place.slot) : null;
}

/**
 * The head of a main column (`MainRail`'s `head`): its title and count, a line
 * under them, and its actions on the right. The title labels the section the
 * column holds (`aria-labelledby={id}`).
 */
export function MainHead({
  id,
  title,
  count,
  line,
  children,
}: {
  id: string;
  title: React.ReactNode;
  count?: number | null;
  line?: React.ReactNode;
  /** The actions, on the right. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
          {title}
          {count !== null && count !== undefined ? (
            <span className="text-theme-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{count.toLocaleString("en-US")}</span>
          ) : null}
        </h2>
        {line ? <div className="mt-0.5 text-theme-sm text-gray-600 dark:text-gray-400">{line}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/**
 * A detail page's tabs, in its sticky bar: each tab a link (its own address,
 * so Back and a shared link land on it), with a word or count saying where
 * that part stands.
 */
export function TabBar({
  label,
  tabs,
  aixId,
}: {
  label: string;
  tabs: Array<{ id: string; label: string; href: string; current: boolean; hint?: string | null; warn?: boolean }>;
  /** Its reference ID, on the sticky bar itself (see `PageBar`). */
  aixId?: string;
}) {
  return (
    <PageBar aixId={aixId}>
      <nav aria-label={label} className="no-scrollbar overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-gray-200 dark:border-white/[0.08]">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <Link
                href={tab.href}
                replace
                scroll={false}
                aria-current={tab.current ? "page" : undefined}
                className={`focus-ring -mb-px flex h-11 items-center gap-2 rounded-t-lg border-b-2 px-3.5 text-theme-sm font-medium transition-colors duration-150 ease-out ${
                  tab.current
                    ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                    : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                {tab.label}
                {tab.hint ? (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                      tab.warn
                        ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                        : "bg-gray-900/[0.05] text-gray-600 dark:bg-white/[0.07] dark:text-gray-300"
                    }`}
                  >
                    {tab.hint}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </PageBar>
  );
}

/** A section of a rail: a small uppercase title and its content, on a card. */
export function RailCard({
  title,
  action,
  children,
  className = "",
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03] ${className}`}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-theme-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A fact in a rail card: a label and its value on one line. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-theme-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-theme-sm font-medium text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- grid */

/** Home, Settings: a head, then sections. */
export function GridPage({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col">
      {head}
      <div className="mt-7 space-y-8">{children}</div>
    </div>
  );
}

/**
 * Cards that add columns as the room grows -- up to `max` -- each line as
 * tall as its tallest card, and the last line never part empty: `Tiles`.
 */
export function CardGrid({
  children,
  max = 4,
  className = "",
}: {
  children: React.ReactNode;
  max?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <Tiles max={max} className={className}>
      {children}
    </Tiles>
  );
}

/**
 * A section of a `GridPage`: its title (and count, and a link to all of it),
 * then its content. A flex column, so in a `Row` (`span`), which stretches it
 * to the row's height, its card can take that height (`flex-1`) and end level
 * with its neighbours.
 */
export function Section({
  id,
  anchor,
  title,
  count,
  action,
  children,
  className = "",
}: {
  id: string;
  /** The section's own id, for a link to it (`/settings#connections`). */
  anchor?: string;
  title: string;
  count?: number | null;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Read by `Row`: twelfths at full width. */
  span?: number;
  className?: string;
}) {
  return (
    <section id={anchor} aria-labelledby={`${id}-heading`} className={`flex min-w-0 flex-col ${anchor ? "scroll-mt-6" : ""} ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={`${id}-heading`} className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">
          {title}
          {count !== null && count !== undefined ? (
            <span className="text-theme-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{count.toLocaleString("en-US")}</span>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
