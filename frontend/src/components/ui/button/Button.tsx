import React, { ReactNode } from "react";

export type ButtonSize = "sm" | "md";
export type ButtonVariant = "primary" | "outline";

// Size classes — match the canonical AI Xccelerate button spec (Jules/Scribe):
// compact = h-7 (28px) px-2.5, default = h-8 (32px) px-3. Approximated onto
// this app's existing text scale (text-xs/text-sm) rather than porting the
// canonical 12px/13px tokens, so nothing else in the type scale changes.
//
// Height is a fixed border-box so primary and outline stay the same size when
// they sit next to each other. `leading-none` stops the type's default
// line-height from overflowing that box. Chrome is a 1px `border` on both
// variants (transparent on primary) — not a drop shadow and not an inset
// ring, which made Save look taller/softer than Discard.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "box-border h-7 px-2.5 text-xs leading-none",
  md: "box-border h-8 px-3 text-sm leading-none",
};

// Variant classes — every state accounted for (hover / active / focus / disabled)
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300",
  outline:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-800 active:bg-gray-100 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white/90",
};

/**
 * The exact classes <Button> renders with. Exported so the rare element that
 * can't be a <button> — a <Link> that needs to stay a real anchor for
 * cmd-click / right-click / hover-preview — can look identical without
 * hand-copying the class string, which is exactly how those two silently
 * drifted apart once before.
 */
export function buttonClassName({
  size = "md",
  variant = "primary",
  disabled = false,
  className = "",
}: {
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
} = {}) {
  return `relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`;
}

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: ButtonSize;
  variant?: ButtonVariant;
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  loading?: boolean; // Loading state — shows spinner, blocks clicks
  type?: "button" | "submit" | "reset";
  className?: string; // Additional classes
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
  type = "button",
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={buttonClassName({ size, variant, disabled: isDisabled, className })}
      onClick={onClick}
      disabled={isDisabled}
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
