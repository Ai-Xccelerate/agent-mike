"use client";

/**
 * A compact picker: a chip that opens a short list of choices.
 *
 * The composer's kind, brand and style, the templates page's "For any use" and
 * the editor's style all need the same thing: one value from a handful, where
 * each option can carry a picture (a type glyph, a palette) and a line saying
 * what it is. `form/Select` draws labels only.
 *
 * The listbox pattern, not a menu: the choice is a value, so a screen reader
 * hears "Deck, collapsed, button" and then a list of options with one selected.
 * Keyboard: Enter/Space/ArrowDown opens on the chosen option, arrows move, Home
 * and End jump, Enter selects, Escape and Tab close, and focus returns to the
 * chip.
 *
 * The list floats (`Floating`): in `<body>`, over the page's cards and bars,
 * and placed against the chip -- flipped, shifted onto the screen and capped
 * to the room it has. A chip in a filter row used to open its list under the
 * next card's full-card button, which took the clicks and the wheel.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { CheckIcon, ChevronDownIcon } from "@/components/common/icons";
import { Floating } from "@/components/ui/floating/Floating";
import { within } from "@/components/ui/floating/layers";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Drawn before the label, in the chip and in the list. */
  icon?: React.ReactNode;
}

/**
 * Room kept free at the bottom of the viewport when choosing a direction: it
 * is where a page's bottom bar (the create page's) and a phone browser's
 * toolbar sit.
 */
const FOOT_CLEARANCE = 96;

/** Letters typed within this long of each other make one prefix to jump to. */
const TYPEAHEAD_MS = 700;

interface ChipMenuProps<T extends string> {
  /** The accessible name of the control, e.g. "Format". */
  label: string;
  value: T;
  options: Array<ChipOption<T>>;
  onChange: (value: T) => void;
  /** What the chip shows; the chosen option's icon and label by default. */
  display?: React.ReactNode;
  align?: "start" | "end";
  /**
   * Which way the list opens. `auto`, the default, opens below unless the room
   * there is short and there is more above, keeping the foot of the window
   * clear -- a select near the foot of a form would otherwise open over the
   * page's own bottom bar. `below` and `above` are preferences: either still
   * turns over rather than open off the screen.
   */
  placement?: "below" | "above" | "auto";
  className?: string;
  disabled?: boolean;
  /** `sm` sits in a composer's row; `md` stands with a toolbar's 40px fields. */
  size?: "sm" | "md";
  /** The full width and height of a form field: a select in a form row. */
  wide?: boolean;
}

export default function ChipMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  display,
  align = "start",
  placement = "auto",
  className = "",
  disabled = false,
  size = "sm",
  wide = false,
}: ChipMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** What has been typed into the open list, and when: see the type-ahead below. */
  const typing = useRef({ text: "", at: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const chosen = options.find((option) => option.value === value) ?? null;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  const openAt = useCallback(() => {
    if (disabled) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }, [disabled, options, value]);

  // Focus follows the list while it is open, so arrow keys work at once.
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  // A workspace can have twenty kits: the list scrolls, and the option the
  // arrows are on stays in view. (`scrollIntoView` is absent in jsdom.)
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from a stable id; `active` and `open` are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Outside click closes, without stealing the focus someone moved elsewhere.
  // The list is in <body>, so "outside" asks `within`, which counts it in.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !within(root.current, event.target)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Typed to jump, as a native select does: "ge" lands on German in a
      // list of sixty languages. Letters typed within a moment build a prefix.
      const now = Date.now();
      const typed = (now - typing.current.at < TYPEAHEAD_MS ? typing.current.text : "") + event.key.toLocaleLowerCase();
      typing.current = { text: typed, at: now };
      const found = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(typed));
      if (found >= 0) {
        event.preventDefault();
        setActive(found);
      }
    }
  };

  return (
    <div ref={root} className={`relative ${wide ? "w-full" : ""} ${className}`}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${chosen?.label ?? "none"}`}
        onClick={() => (open ? close() : openAt())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt();
          }
        }}
        className={`focus-ring inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white font-medium text-gray-700 transition-colors duration-150 ease-out hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:border-white/[0.16] ${
          wide
            ? "h-11 w-full justify-between px-3.5 text-theme-sm"
            : size === "md"
              ? "h-10 px-3 text-theme-sm"
              : "h-8 px-2.5 text-theme-xs pointer-coarse:h-11"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {display ?? (
            <>
              {chosen?.icon ? <span className="text-gray-500 dark:text-gray-400">{chosen.icon}</span> : null}
              <span className="truncate">{chosen?.label ?? label}</span>
            </>
          )}
        </span>
        <ChevronDownIcon className="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
      <Floating
        open={open}
        anchor={trigger}
        side={placement === "above" ? "top" : "bottom"}
        align={align}
        offset={8}
        matchWidth={wide}
        reserveBelow={placement === "auto" ? FOOT_CLEARANCE : 0}
      >
        {/* `overscroll-contain`: at the end of the list the wheel stops, rather
            than going on to scroll the page out from under it. */}
        <ul
          ref={list}
          id={listId}
          role="listbox"
          // In the tab order while open, so a list long enough to scroll is
          // reachable by keyboard as a scroll region too (axe
          // scrollable-region-focusable); focus is put on it when it opens.
          tabIndex={0}
          aria-label={label}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
          className={`glass-popover custom-scrollbar max-h-[min(20rem,60vh)] overflow-y-auto overscroll-contain rounded-xl border p-1 shadow-theme-lg focus:outline-none ${
            wide ? "w-full" : "min-w-56 max-w-80"
          }`}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-theme-sm ${
                  index === active ? "bg-gray-100 dark:bg-white/[0.06]" : ""
                }`}
              >
                {option.icon ? (
                  <span className="mt-0.5 text-gray-500 dark:text-gray-400">{option.icon}</span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-900 dark:text-white">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <CheckIcon className="mt-0.5 size-4 text-brand-ink dark:text-brand-400" />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Floating>
    </div>
  );
}
