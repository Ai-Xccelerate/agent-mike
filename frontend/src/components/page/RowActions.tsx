"use client";

/**
 * A row's actions, as compact as the screen needs them to be.
 *
 * - **A wide list** (64rem and up): every action as a small button with its
 *   icon and its words.
 * - **A desktop list**: the main action keeps its words; the rest are their
 *   icons, named (the words are there for a screen reader, and on hover with
 *   the key that does the same).
 * - **A narrow list** (under 48rem): the main action, and a "More" menu with
 *   the rest.
 *
 * Measured against the list, not the window (container queries on
 * `ListFrame`): a list beside the preview pane on a 1920px screen is as
 * narrow as one on a laptop, and should look like it.
 *
 * One set of buttons drawn three ways by CSS rather than three components
 * chosen by a media query, so the row never re-mounts as a window is
 * resized and every action has exactly one control in the document.
 *
 * An action can live in the menu at every width (`menuOnly`): a destructive
 * one (Delete) is a deliberate second step, never an icon beside Copy link.
 * The menu is then there on a wide list too, and lists what is not already
 * drawn beside it -- decided as it opens, from whether the inline actions are
 * showing.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MoreIcon } from "@/components/common/icons";
import { Floating } from "@/components/ui/floating/Floating";
import { within } from "@/components/ui/floating/layers";

export interface RowAction {
  id: string;
  /** Its name: what a screen reader says and the hint shows ("Add to Acme rollout"). */
  label: string;
  /**
   * The words drawn, when the row already says the rest ("Add", beside a
   * column that names the deal). The name stays `label`.
   */
  short?: string;
  icon: React.ReactNode;
  onSelect?: () => void;
  href?: string;
  /** The row's main action: keeps its words at every width, first in line. */
  primary?: boolean;
  /** The single key that does the same (`useListKeys`), drawn in its hint. */
  shortcut?: string;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  /** Only ever in the "More" menu, at every width: a destructive action, a step away from the row. */
  menuOnly?: boolean;
}

const BUTTON =
  "focus-ring relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-theme-xs font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60 before:absolute before:-inset-1 before:content-['']";
const QUIET =
  "text-gray-700 hover:bg-gray-900/[0.05] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white";
const OUTLINED =
  "bg-white text-gray-800 shadow-theme-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-white/[0.03] dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-white/[0.06]";
const DANGER = "hover:bg-error-50! hover:text-error-700! dark:hover:bg-error-500/10! dark:hover:text-error-400!";

function hint(action: RowAction): string {
  return action.shortcut ? `${action.label} (${action.shortcut})` : action.label;
}

function Inline({
  action,
  describedBy,
  wideWords,
}: {
  action: RowAction;
  describedBy?: string;
  /** The container size from which the secondary actions show their words. */
  wideWords: string;
}) {
  const tone = `${action.primary ? OUTLINED : QUIET} ${action.destructive ? DANGER : ""}`;
  // The secondary actions are icons in a desktop list; the words stay for a
  // screen reader (`sr-only`) and come back in a wide one.
  const shown = action.short ?? action.label;
  const words = action.primary ? (
    <span className="max-w-[16rem] truncate">{shown}</span>
  ) : (
    <span className={`sr-only ${wideWords}`}>{shown}</span>
  );
  // A shorter word on screen than the name: the name goes on the control.
  const name = action.short && action.short !== action.label ? action.label : undefined;
  const body = (
    <>
      {action.loading ? (
        <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
      ) : (
        <span aria-hidden="true">{action.icon}</span>
      )}
      {words}
    </>
  );
  const width = action.primary ? "" : wideWords === "@7xl:not-sr-only" ? "@max-7xl:w-8 @max-7xl:px-0" : "@max-5xl:w-8 @max-5xl:px-0";
  if (action.href) {
    return (
      <Link
        href={action.href}
        title={hint(action)}
        aria-label={name}
        aria-describedby={describedBy}
        aria-keyshortcuts={action.shortcut}
        className={`${BUTTON} ${tone} ${width}`}
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={hint(action)}
      aria-label={name}
      aria-describedby={describedBy}
      aria-keyshortcuts={action.shortcut}
      disabled={action.disabled || action.loading}
      onClick={(event) => {
        // A row may select itself on click; its actions are not that.
        event.stopPropagation();
        action.onSelect?.();
      }}
      className={`${BUTTON} ${tone} ${width}`}
    >
      {body}
    </button>
  );
}

export default function RowActions({
  actions,
  name,
  describedBy,
  wordsFrom = "5xl",
}: {
  actions: RowAction[];
  /** What the row is, for the menu's name: "More for Kick-off with Acme". */
  name: string;
  /** The row's title element, so each action is heard with what it acts on. */
  describedBy?: string;
  /**
   * The list width from which the secondary actions show their words: a
   * list with many columns (Meetings) keeps them icons until it is very wide.
   */
  wordsFrom?: "5xl" | "7xl";
}) {
  const wideWords = wordsFrom === "7xl" ? "@7xl:not-sr-only" : "@5xl:not-sr-only";
  const shown = actions.filter(Boolean);
  const primary = shown.find((action) => action.primary);
  const rest = shown.filter((action) => action !== primary);
  const inline = rest.filter((action) => !action.menuOnly);
  const always = rest.some((action) => action.menuOnly);
  const inlineGroup = useRef<HTMLDivElement>(null);
  if (shown.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      {primary ? <Inline action={primary} describedBy={describedBy} wideWords={wideWords} /> : null}
      <div ref={inlineGroup} className="hidden items-center gap-0.5 @3xl:flex">
        {inline.map((action) => (
          <Inline key={action.id} action={action} describedBy={describedBy} wideWords={wideWords} />
        ))}
      </div>
      {rest.length ? <MoreMenu actions={rest} name={name} always={always} inlineGroup={inlineGroup} /> : null}
    </div>
  );
}

/** Whether `group` is drawn (a desktop list): its actions are then not repeated in the menu. */
function showing(group: HTMLElement | null): boolean {
  return Boolean(group) && window.getComputedStyle(group as HTMLElement).display !== "none";
}

/** In a narrow list: the actions that are icons on a desktop, in a menu. */
function MoreMenu({
  actions,
  name,
  always = false,
  inlineGroup,
}: {
  actions: RowAction[];
  name: string;
  /** There at every width: something in it lives only in the menu. */
  always?: boolean;
  /** The inline actions, whose visibility says which of `actions` the menu lists. */
  inlineGroup?: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  // Decided as it opens: on a wide list the inline actions are beside it already.
  const [listed, setListed] = useState<RowAction[]>(actions);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    surface.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const onDown = (event: MouseEvent) => {
      if (root.current && !within(root.current, event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-theme-sm font-medium text-gray-700 outline-none hover:bg-gray-100 focus-visible:bg-gray-100 disabled:opacity-60 max-sm:min-h-11 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]";

  return (
    <div ref={root} className={`relative ${always ? "" : "@3xl:hidden"}`}>
      <button
        ref={trigger}
        type="button"
        aria-label={`More for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          // Without a menu-only action the menu is drawn only on a narrow list (CSS), where nothing is inline.
          const inlineShown = always && showing(inlineGroup?.current ?? null);
          setListed(inlineShown ? actions.filter((action) => action.menuOnly) : actions);
          setOpen(true);
        }}
        className={`${BUTTON} ${QUIET} w-8 px-0 max-sm:size-11`}
      >
        <MoreIcon className="size-[18px]" />
      </button>
      <Floating open={open} anchor={trigger} align="end" offset={6}>
        <div
          ref={surface}
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDown={(event) => {
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"));
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === "Tab") {
              close(false);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              items[(at + step + items.length) % items.length]?.focus();
            }
          }}
          className="glass-popover animate-rise w-56 rounded-xl border p-1 shadow-theme-lg"
        >
          {listed.map((action) =>
            action.href ? (
              <Link
                key={action.id}
                href={action.href}
                role="menuitem"
                tabIndex={-1}
                className={item}
                onClick={() => close(false)}
              >
                <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">
                  {action.icon}
                </span>
                {action.label}
              </Link>
            ) : (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={action.disabled || action.loading}
                className={`${item} ${action.destructive ? "text-error-700! dark:text-error-400!" : ""}`}
                onClick={() => {
                  close();
                  action.onSelect?.();
                }}
              >
                <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">
                  {action.icon}
                </span>
                {action.label}
              </button>
            ),
          )}
        </div>
      </Floating>
    </div>
  );
}
