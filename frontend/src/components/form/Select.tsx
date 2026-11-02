"use client";

import React, { useEffect, useId, useRef, useState } from "react";

import { Floating } from "@/components/ui/floating/Floating";
import { within } from "@/components/ui/floating/layers";
import { CheckLineIcon } from "@/icons";

interface Option {
  value: string;
  label: string;
  /** A second, quieter line under the label (a role, an email). */
  description?: string;
  /** Options sharing a group are listed under its heading, in the order given. */
  group?: string;
}

interface SelectProps {
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Controlled value — when provided, the parent owns selection state. */
  value?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  /** "field" = bordered form control (default); "ghost" = borderless inline picker. */
  variant?: "field" | "ghost";
  disabled?: boolean;
}

// Custom listbox dropdown (no native <select>) so the menu is fully styled and
// consistent across the whole template — matches the design system, dark mode,
// and density. Keyboard-accessible: ↑/↓/Home/End move, Enter/Space select,
// Esc closes, outside-click dismisses; exposes combobox/listbox/option roles.
// Supports both controlled (`value`) and uncontrolled (`defaultValue`) usage.
// The list floats in <body> (`Floating`), as wide as the field, so no card or
// scrolling panel around the field can cover it or cut it off.
const Select: React.FC<SelectProps> = ({
  options,
  placeholder = "Select an option",
  onChange,
  className = "",
  defaultValue = "",
  value,
  id,
  name,
  ariaLabel,
  size = "md",
  variant = "field",
  disabled = false,
}) => {
  const [internal, setInternal] = useState<string>(defaultValue);
  const current = value !== undefined ? value : internal;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;

  const selected = options.find((o) => o.value === current) ?? null;

  // The field register (`InputField`, the `field` utility): 40px, a hairline
  // that deepens on hover, brand-600 and a soft ring on focus, no fill in dark.
  const sizeCls = size === "sm" ? "h-9 text-sm" : "h-10 text-sm";
  const padCls = variant === "ghost" ? "px-2.5" : "px-3";
  const variantCls =
    variant === "ghost"
      ? "border border-transparent bg-transparent hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-700 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06] dark:focus-visible:ring-brand-400"
      : "border border-gray-300 bg-transparent shadow-theme-xs hover:border-gray-400 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-white/[0.08] dark:hover:border-white/[0.16] dark:focus-visible:border-brand-500";

  const select = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openMenu = () => {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === current);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // The list is in <body>: `within` counts it as inside the field.
      if (containerRef.current && !within(containerRef.current, e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-option-${active}`)}`)
      ?.scrollIntoView({ block: "nearest" });
    // `optionId` is inlined here rather than listed as a dependency: it is a
    // fresh closure every render, so depending on it would re-run the scroll on
    // every keystroke.
  }, [active, open, baseId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[active];
      if (opt) select(opt.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel ?? placeholder}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg text-left font-medium transition-colors duration-150 ease-out focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60 ${sizeCls} ${padCls} ${variantCls} ${
          selected
            ? "text-gray-900 dark:text-white"
            : "text-gray-500 dark:text-gray-400"
        } ${className}`}
      >
        <span className="truncate font-normal">
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`shrink-0 text-gray-500 transition-transform duration-150 dark:text-gray-400 ${
            open ? "rotate-180" : ""
          } ${size === "sm" ? "size-4" : "size-5"}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4.79175 7.396L10.0001 12.6043L15.2084 7.396"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Floating open={open} anchor={triggerRef} matchWidth offset={6}>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? placeholder}
          className="glass-popover custom-scrollbar max-h-60 w-full min-w-[8rem] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 p-1 shadow-theme-lg dark:border-white/[0.08]"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === current;
            const isActive = i === active;
            const heading = opt.group && opt.group !== options[i - 1]?.group ? opt.group : null;
            return (
              <React.Fragment key={opt.value}>
              {heading ? (
                <li
                  role="presentation"
                  className="px-3 pt-2.5 pb-1 text-theme-xs font-medium uppercase tracking-wider text-gray-500 first:pt-1.5 dark:text-gray-400"
                >
                  {heading}
                </li>
              ) : null}
              <li
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(opt.value)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-100 ${
                  // The option the keys are on is a grey tint, as in `ChipMenu`;
                  // the chosen one is ink with a check. Orange is the action's.
                  isActive
                    ? "bg-gray-100 text-gray-900 dark:bg-white/[0.06] dark:text-white"
                    : isSelected
                    ? "font-medium text-gray-900 dark:text-white"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description ? (
                    <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
                      {opt.description}
                    </span>
                  ) : null}
                </span>
                {isSelected && (
                  <CheckLineIcon
                    className="size-4 shrink-0 text-gray-900 dark:text-white"
                  />
                )}
              </li>
              </React.Fragment>
            );
          })}
        </ul>
      </Floating>
    </div>
  );
};

export default Select;
