/**
 * A page's head (LIB-PAGEHEAD), in the register every Artifacts and Persuade
 * page draws: an eyebrow, the title, one line of live context, and the page's
 * primary action.
 *
 * One component rather than class strings copied into each page: a head drawn
 * eleven times drifts eleven ways. The classes are the products' own, so a
 * page from this template and a page from Artifacts put side by side line up.
 * There is no breadcrumb trail, on purpose: the sidebar already says where you
 * are. (`PageBreadcrumb` is this head under its old name, with the section
 * filled in from the navigation registry.)
 */

export function PageHead({
  eyebrow,
  title,
  context,
  action,
  meta,
}: {
  /** A few words above the title: the workspace, or the section a page sits in. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** One line that is true right now ("No deals yet"), not a description of the page. */
  context?: React.ReactNode;
  /** The page's one orange moment, if it has one. */
  action?: React.ReactNode;
  /** Controls that belong to the title (a deal's stage and owner), under the context line. */
  meta?: React.ReactNode;
}) {
  return (
    <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
      {/* At least 16rem before the action may sit beside it: on a phone the
          title takes the row and the action goes under it. */}
      <div className="min-w-0 flex-1 basis-64">
        {eyebrow ? (
          <p className="truncate text-theme-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        {context ? (
          <p className="mt-1.5 max-w-[40rem] text-theme-sm text-gray-600 dark:text-gray-400">{context}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

/**
 * The classes of the page's primary action when it is a link (a `Link` that
 * looks like `Button`): brand-700 (white on it is 4.63:1; on brand-500 it is
 * 2.76:1) with the CTA shadow, 36px, 44px on touch.
 */
export const PRIMARY_LINK =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand-700 px-3.5 text-sm font-semibold text-white shadow-[var(--shadow-cta)] transition-colors duration-150 ease-out hover:bg-brand-800 active:bg-brand-900 pointer-coarse:h-11";

/** The outlined partner of `PRIMARY_LINK`, for a second action beside it. */
export const OUTLINE_LINK =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-white px-3.5 text-sm font-medium text-gray-700 shadow-theme-xs ring-1 ring-inset ring-gray-300 transition-colors duration-150 ease-out hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 pointer-coarse:h-11 dark:bg-white/[0.03] dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-white/[0.06]";
