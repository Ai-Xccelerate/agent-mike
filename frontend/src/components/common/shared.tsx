"use client";

/**
 * Shared building blocks for every AIX screen (LIB-SHARED).
 *
 * The same card, empty state, error, skeleton, copy button, back link and
 * confirmation the Artifacts and Persuade frontends draw, so they read the
 * same in every product. All of it follows the AIX design system: brand
 * orange used once per view, cards opaque and flat (glass is for chrome
 * only), radii from the token scale, tabular numerals on data, sentence case.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";

/* -------------------------------------------------------------------------- */
/* Cards and layout                                                           */
/* -------------------------------------------------------------------------- */
export function Card({
  children,
  className = "",
  ref,
  ...rest
}: React.ComponentPropsWithRef<"div">) {
  // `ref` as a plain prop: React 19 dropped the need for `forwardRef`.
  return (
    <div
      ref={ref}
      {...rest}
      // Merged, not appended: a caller's tint, border or padding (ErrorPanel's
      // error tint, `p-0`) has to win over the defaults.
      className={twMerge(
        "rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  id,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 id={id} className="text-theme-sm font-semibold text-gray-900 dark:text-white">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** The empty-state picture: a small stack of sheets, the shape of "a thing that is not here yet". */
function SheetsArt() {
  return (
    <div aria-hidden="true" className="relative mx-auto mb-5 h-12 w-16">
      <span className="absolute left-1 top-2 h-9 w-12 -rotate-6 rounded-md border border-gray-200 bg-white dark:border-white/[0.1] dark:bg-white/[0.04]" />
      <span className="absolute left-3 top-1 h-9 w-12 rotate-3 rounded-md border border-gray-200 bg-white dark:border-white/[0.1] dark:bg-white/[0.04]" />
      <span className="absolute left-2 top-0 flex h-9 w-12 flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5 dark:border-white/[0.1] dark:bg-gray-900">
        <span className="h-1 w-5 rounded bg-brand-400" />
        <span className="h-1 w-8 rounded bg-gray-200 dark:bg-white/[0.12]" />
        <span className="h-1 w-7 rounded bg-gray-200 dark:bg-white/[0.12]" />
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  art,
  children,
  level = 3,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  /** A picture of the thing that is missing; the stack of sheets by default. */
  art?: React.ReactNode;
  /** Anything that belongs under the sentence and above the action. */
  children?: React.ReactNode;
  /** Its heading's level, so it follows the page's outline: an h3 under an h1 skips one. */
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    /* An invitation, not a shrug: the design system's empty state is a picture,
       one sentence and an action. */
    // A flex column, centred: where a column stretches it (a main column level with its rail), it stays centred.
    <div className="animate-rise flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-white/[0.08]">
      {art ?? <SheetsArt />}
      <Heading className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">
        {title}
      </Heading>
      <div className="mx-auto mt-2 max-w-md text-theme-sm leading-relaxed text-gray-500 dark:text-gray-400">
        {body}
      </div>
      {children}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */
/**
 * A failure, as something a person can act on: what happened, in a sentence,
 * and -- where it might not repeat -- a way to try again.
 *
 * Generic on purpose: give it any thrown value and it says the error's own
 * message, or give it `title` / `detail` written for a person. An app with
 * RFC 7807 problems (Artifacts, Persuade) maps its problem onto these props --
 * the panel's look stays the same everywhere.
 */
export function ErrorPanel({
  error,
  title = "That could not be loaded",
  detail,
  reference,
  onRetry,
}: {
  error?: unknown;
  /** What failed, in a few words. */
  title?: string;
  /** Why, and what to do about it. Falls back to the error's own message. */
  detail?: React.ReactNode;
  /** A trace id or request id, for support. */
  reference?: string | null;
  /**
   * Offered where the failure might not repeat (a dropped connection, a 502).
   * Not for a validation failure: inviting someone to try again when it will
   * fail identically is a small lie.
   */
  onRetry?: () => void;
}) {
  const message = detail ?? (error instanceof Error ? error.message : "Please try again in a moment.");
  return (
    <Card role="alert" className="border-error-200 bg-error-25 dark:border-error-500/20 dark:bg-error-500/5">
      <h3 className="text-theme-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-theme-sm text-gray-600 dark:text-gray-300">{message}</p>
      {reference ? (
        <p className="mt-3 font-mono text-theme-xs text-gray-500 dark:text-gray-400">Reference: {reference}</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */
export function Skeleton({ className = "" }: { className?: string }) {
  // A tint of the ink rather than gray-100: most skeletons stand on the page's
  // own grey, which is gray-100 to within a shade, so a gray-100 block loads as
  // an empty page. A tint shows on that grey and on a white card alike.
  //
  // Merged rather than appended, so a caller's `rounded-full` (an avatar) or
  // `rounded-2xl` (a card) replaces the default corner instead of losing to it
  // on stylesheet order.
  return (
    <div className={twMerge("animate-pulse rounded-lg bg-gray-900/[0.07] dark:bg-white/[0.06]", className)} />
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-4 h-3 w-1/2" />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy to clipboard                                                          */
/* -------------------------------------------------------------------------- */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard access is denied in some embedded contexts. Selecting the
          // text is the fallback, so failing silently is better than an alert.
        }
      }}
      className={
        // Borders never carry colour (design system section 4), so the hover
        // is a text and background change and the border only deepens.
        "focus-ring rounded-lg border border-gray-200 px-3 py-1.5 text-theme-xs font-medium " +
        "text-gray-700 transition-colors duration-150 ease-out hover:border-gray-300 " +
        "hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 dark:border-white/[0.08] " +
        "dark:text-gray-300 dark:hover:border-white/[0.14] dark:hover:bg-white/[0.04] " +
        "dark:hover:text-white/90 dark:active:bg-white/[0.07] " +
        className
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Midnight of the local day `date` falls on. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * When something happened, the way a person says it: "just now", "10 minutes
 * ago", "3 hours ago", "yesterday", "3 days ago", then the date. Days are
 * calendar days: something from last night is "yesterday" this morning.
 */
export function sinceLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(iso, now);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "25 Sep", with the year only when it is not this one. Day first, like the
 * rest of the product's copy, and spelt from a table rather than the browser's
 * locale data, which abbreviates September as "Sept" in some versions.
 */
export function shortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}${year}`;
}

/** "25 September", for a sentence. */
export function longDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}

/**
 * "1,284". Pinned to en-US: the server's default locale need not be the
 * browser's (en-IN prints "1,48,000"), and a number formatted two ways is a
 * hydration mismatch.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/* -------------------------------------------------------------------------- */
/* Navigation helpers                                                         */
/* -------------------------------------------------------------------------- */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring -mx-1 inline-flex items-center gap-1.5 rounded-lg px-1 text-theme-sm text-gray-600 transition-colors duration-150 ease-out hover:text-brand-800 dark:text-gray-400 dark:hover:text-brand-400"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 12L6 8l4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation                                                               */
/* -------------------------------------------------------------------------- */
/**
 * A destructive-action confirmation, in the app's own chrome, never
 * `window.confirm` (unstyled, cannot say which button is dangerous, and an
 * origin can have it suppressed after a few uses).
 *
 * The destructive button is the *outlined* one and the safe default is focused
 * first, so a reflexive Enter cancels rather than deletes.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  tone = "danger",
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  tone?: "danger" | "default";
}) {
  return (
    <Modal isOpen={open} onClose={onCancel} ariaLabel={title} className="max-w-md p-6" showCloseButton={false}>
      <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-2 text-theme-sm text-gray-600 dark:text-gray-400">{body}</div>
      <div className="mt-6 flex items-center justify-end gap-3">
        {/* Cancel first in the DOM so the modal's own focus-the-first-control
            behaviour lands on the safe choice. */}
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={tone === "danger" ? "outline" : "primary"}
          loading={loading}
          onClick={onConfirm}
          className={
            tone === "danger"
              ? "ring-error-300! text-error-600! hover:bg-error-50! dark:ring-error-500/30! dark:text-error-400! dark:hover:bg-error-500/10!"
              : ""
          }
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
