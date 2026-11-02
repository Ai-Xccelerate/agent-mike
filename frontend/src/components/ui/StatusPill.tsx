/**
 * A state worth a look, as a pill: a dot or glyph, a word, a colour.
 *
 * Only for the states that need attention -- Live, Needs review, Failed,
 * Generating -- and the one fact that changes how an artifact is treated
 * (Template). The normal states say nothing: "Not published" on nine cards of
 * ten, or "confirmed" on every kit, drew the eye nine times to say nothing, and
 * the one that mattered had to compete with them.
 *
 * Colour is never the only signal: every pill carries its word (WCAG 1.4.1).
 * The neutral pill is outlined, because it sits on the page's grey ground where
 * a grey fill would disappear.
 */

import { AlertIcon, StarIcon, UsersIcon } from "@/components/common/icons";

export type PillTone = "live" | "review" | "failed" | "working" | "neutral" | "brand";

const TONE: Record<PillTone, string> = {
  live: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  review: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  failed: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  working: "bg-gray-900/[0.06] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200",
  neutral:
    "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.04] dark:text-gray-200 dark:ring-white/[0.1]",
  brand: "bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300",
};

const DOT: Partial<Record<PillTone, string>> = {
  live: "bg-success-500",
  working: "bg-brand-500 animate-pulse-dot",
};

export default function StatusPill({
  tone,
  children,
  icon,
  className = "",
}: {
  tone: PillTone;
  children: React.ReactNode;
  /** A glyph instead of the dot: "review" gets a warning sign by default. */
  icon?: "star" | "team" | "alert" | null;
  className?: string;
}) {
  const glyph =
    icon === "star" ? (
      <StarIcon className="size-3" />
    ) : icon === "team" ? (
      <UsersIcon className="size-3" />
    ) : icon === "alert" || (icon === undefined && tone === "review") ? (
      <AlertIcon className="size-3" />
    ) : null;
  const dot = DOT[tone];
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-theme-xs font-medium ${TONE[tone]} ${className}`}
    >
      {glyph ?? (dot ? <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} /> : null)}
      {children}
    </span>
  );
}
