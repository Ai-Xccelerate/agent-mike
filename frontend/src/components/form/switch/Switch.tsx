"use client";
import React, { useState } from "react";

interface SwitchProps {
  label: string;
  defaultChecked?: boolean;
  /** Controlled state. Leave it out and the switch keeps its own, from `defaultChecked`. */
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  /**
   * The track when on. `ink` (the default; `gray` is its old name) is the
   * register Persuade's settings use: on is gray-900 (white on dark), never
   * orange, so a form's primary button stays the one orange moment. `brand`
   * (`blue`, its old name) is kept for a caller that asks for it.
   */
  color?: "ink" | "brand" | "gray" | "blue";
  className?: string;
}

/**
 * An on/off setting (LIB-SWITCH): a `button` with the switch role, the track
 * and its label inside, so a click anywhere on it, Space and Enter all toggle
 * it and a screen reader hears "Weekly digest, switch, on". 44px track, the
 * label 12px after it -- a hint under it lines up at `pl-14`.
 */
const Switch: React.FC<SwitchProps> = ({
  label,
  defaultChecked = false,
  checked,
  disabled = false,
  onChange,
  color = "ink",
  className = "",
}) => {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  const ink = color !== "brand" && color !== "blue";

  const toggle = () => {
    if (disabled) return;
    const next = !on;
    if (checked === undefined) setOwn(next);
    onChange?.(next);
  };

  const track = disabled
    ? on
      ? ink
        ? "bg-gray-400 dark:bg-white/30"
        : "bg-brand-300 dark:bg-brand-500/40"
      : "bg-gray-100 dark:bg-white/[0.06]"
    : on
      ? ink
        ? "bg-gray-900 dark:bg-white"
        : "bg-brand-600"
      : "bg-gray-300 group-hover:bg-gray-400 dark:bg-white/15 dark:group-hover:bg-white/20";

  const knob = on && ink && !disabled ? "bg-white dark:bg-gray-900" : "bg-white";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={`group flex select-none items-center gap-3 text-left text-sm font-medium focus-visible:outline-none ${
        disabled ? "cursor-not-allowed text-gray-500 dark:text-gray-500" : "cursor-pointer text-gray-800 dark:text-gray-200"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-out group-focus-visible:ring-2 group-focus-visible:ring-brand-700 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-white dark:group-focus-visible:ring-brand-400 dark:group-focus-visible:ring-offset-gray-900 ${track}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-5 rounded-full shadow-theme-sm transition-transform duration-150 ease-out ${knob} ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
};

export default Switch;
