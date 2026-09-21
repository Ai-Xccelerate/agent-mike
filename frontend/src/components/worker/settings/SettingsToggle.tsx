"use client";

import type { ReactNode } from "react";

/**
 * The switch used everywhere in Settings.
 *
 * It was hand-rolled in eight places — every integration card, the tools
 * list, guardrails, channels — with the same markup retyped each time and
 * small differences creeping in: some had an `aria-label`, some did not, the
 * disabled styling was inconsistent, and only a few carried a focus ring.
 * A switch that cannot be reached or seen by keyboard is a real defect, not a
 * cosmetic one, so it is worth having exactly one of these.
 *
 * Motion is colour and transform only, 150ms — no scale, no bounce.
 */
export default function SettingsToggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onChange: () => void;
  /** What this switch controls, for assistive tech. Never rendered. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-gray-900 ${
        checked ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
      } ${className}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform duration-150 ease-out ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

/**
 * A labelled row with a switch on the right — the shape used for every
 * on/off setting that is a plain flag rather than a connection.
 */
export function SettingsToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  badge,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <SettingsToggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
