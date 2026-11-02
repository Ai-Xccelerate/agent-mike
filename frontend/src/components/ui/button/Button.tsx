import React, { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  /**
   * Heights are fixed, not padding-derived, so a row of buttons of one size lines
   * up whatever each one holds: sm 36px, md 40px, lg 44px (the touch target the
   * phone layouts use for their one primary action).
   */
  size?: "sm" | "md" | "lg";
  /**
   * `primary` is the page's one orange moment; `outline` everything beside it;
   * `ghost` a quiet text action (Cancel next to a primary).
   */
  variant?: "primary" | "outline" | "ghost";
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  loading?: boolean; // Loading state — shows spinner, blocks clicks
  type?: "button" | "submit" | "reset";
  /** The id of the form a submit button belongs to, when it sits outside it. */
  form?: string;
  /** The keyboard shortcut that does the same thing, e.g. "Control+S". */
  "aria-keyshortcuts"?: string;
  /** For an icon-only button, which has no text to be named by. */
  "aria-label"?: string;
  /** What explains it: a disabled button's reason, said beside it. */
  "aria-describedby"?: string;
  /** As a menu or dialog trigger: what it opens, and whether it is open. */
  "aria-haspopup"?: "menu" | "dialog" | "listbox" | boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  id?: string;
  /** React 19: a plain prop, so a Button can anchor a `Dropdown`. */
  ref?: React.Ref<HTMLButtonElement>;
  className?: string; // Additional classes
}

const SIZE_CLASSES = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

/*
 * Primary is brand-700, not brand-500.
 *
 * White on #f47920 is 2.76:1 -- under WCAG AA's 4.5:1 for text, and under the
 * 3:1 it allows large text -- so the product's most important button had the
 * least legible label on the page. White on #bc580f is 4.63:1 and still reads
 * as the brand; the bright orange stays for marks, charts and selection.
 */
const VARIANT_CLASSES = {
  primary:
    "bg-brand-700 font-semibold text-white shadow-[var(--shadow-cta)] hover:bg-brand-800 active:bg-brand-900",
  outline:
    "bg-white text-gray-700 shadow-theme-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-800 active:bg-gray-100 dark:bg-white/[0.03] dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white/90",
  ghost:
    "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
};

/*
 * Disabled is a colour, not a fade.
 *
 * It used to be `disabled:bg-brand-300` plus `opacity-60` over the whole
 * element, which fades the label and the background *together* -- so the
 * contrast between them never improves, it only gets darker. Measured on the
 * dark theme: white at 60% over brand-300 at 60% is 1.57:1, which is a button
 * whose words cannot be read. The accent was wrong as well as faint: an
 * unavailable control should not be wearing the colour that means "press
 * this".
 *
 * Loading keeps the accent. It is the same button doing the thing it was
 * pressed for, and greying it out mid-request reads as a failure.
 */
const DISABLED_CLASSES = {
  primary:
    "disabled:bg-gray-100 disabled:text-gray-500 disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-gray-200 dark:disabled:bg-white/[0.06] dark:disabled:text-gray-400 dark:disabled:ring-white/[0.08]",
  outline:
    "disabled:bg-gray-50 disabled:text-gray-500 disabled:ring-gray-200 dark:disabled:bg-white/[0.02] dark:disabled:text-gray-400 dark:disabled:ring-white/[0.06]",
  ghost: "disabled:text-gray-500 disabled:hover:bg-transparent dark:disabled:text-gray-500",
};

type ButtonSize = keyof typeof SIZE_CLASSES;
type ButtonVariant = keyof typeof VARIANT_CLASSES;

/**
 * The button's classes on their own, for an element that is not a `<button>`
 * (a Next `Link` styled as one), so it never drifts from the real thing.
 */
export function buttonClassName({
  size = "md",
  variant = "primary",
  disabled = false,
  loading = false,
  className = "",
}: {
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
} = {}) {
  return `relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 ease-out focus-ring ${
    SIZE_CLASSES[size]
  } ${VARIANT_CLASSES[variant]} ${loading ? "cursor-wait" : ""} ${
    disabled && !loading ? `cursor-not-allowed ${DISABLED_CLASSES[variant]}` : ""
  } ${className}`;
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  loading = false,
  "aria-keyshortcuts": keyShortcuts,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-haspopup": hasPopup,
  "aria-expanded": expanded,
  "aria-controls": controls,
  id,
  ref,
  type = "button",
  form,
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      id={id}
      type={type}
      form={form}
      aria-haspopup={hasPopup}
      aria-expanded={expanded}
      aria-controls={controls}
      className={buttonClassName({ size, variant, disabled, loading, className })}
      onClick={onClick}
      disabled={isDisabled}
      aria-keyshortcuts={keyShortcuts}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-busy={loading}
    >
      {loading && (
        <span
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {!loading && startIcon && (
        <span className="flex items-center">{startIcon}</span>
      )}
      {children}
      {!loading && endIcon && (
        <span className="flex items-center">{endIcon}</span>
      )}
    </button>
  );
};

export default Button;
