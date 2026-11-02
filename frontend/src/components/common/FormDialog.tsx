"use client";

/**
 * A dialog that is a form: a head (title, one line, Close), a body that
 * scrolls, and a foot with Cancel and the one action -- the shape Add a source
 * and Write a proposal draw by hand, kept in one place for Phase 2's dialogs.
 *
 * The form inside is mounted only while the dialog is open; a form whose
 * state lives above it takes `useOpenSession(open)` as its key, so every
 * opening starts clean and a half-typed answer from last time never reappears.
 */

import { useId, useState } from "react";

import { XIcon } from "@/components/common/icons";
import Button from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";

/**
 * A number that changes each time `open` turns true: the key a dialog's form
 * takes, so every opening starts clean (fields, errors, results) while the
 * dialog itself stays mounted long enough to fade out.
 */
export function useOpenSession(open: boolean): number {
  const [session, setSession] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setSession((value) => value + 1);
  }
  return session;
}

export const LABEL = "mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300";
export const HINT = "mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400";
export const OPTIONAL = "font-normal text-gray-500 dark:text-gray-400";

export function FormDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  submitLabel,
  submitting = false,
  submitDisabled = false,
  onSubmit,
  footNote,
  closeLabel = "Cancel",
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** No submit button when absent: a dialog that only shows a result. */
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit?: () => void;
  /** A line at the left of the foot (a count, a warning). */
  footNote?: React.ReactNode;
  closeLabel?: string;
  width?: string;
}) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className={`max-h-[100dvh] w-full ${width} sm:max-h-[min(52rem,calc(100dvh-3rem))]`}
    >
      {open ? (
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!submitDisabled && !submitting) onSubmit?.();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-white/[0.06]">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                {title}
              </h2>
              {subtitle ? <p className="mt-0.5 text-theme-sm text-gray-600 dark:text-gray-400">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring -mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              <XIcon className="size-5" />
            </button>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-3.5 sm:px-6 dark:border-white/[0.06]">
            {footNote ? <div className="mr-auto min-w-0 text-theme-xs text-gray-500 dark:text-gray-400">{footNote}</div> : null}
            <Button variant="ghost" onClick={onClose}>
              {closeLabel}
            </Button>
            {submitLabel ? (
              <Button type="submit" loading={submitting} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

/** A refusal or a problem, inside a dialog, read out when it appears. */
export function DialogAlert({ tone = "error", children }: { tone?: "error" | "warning"; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={
        tone === "error"
          ? "rounded-xl border border-error-200 bg-error-25 px-3.5 py-3 text-theme-sm text-gray-800 dark:border-error-500/20 dark:bg-error-500/[0.06] dark:text-gray-200"
          : "rounded-xl border border-warning-200 bg-warning-25 px-3.5 py-3 text-theme-sm text-gray-800 dark:border-warning-500/20 dark:bg-warning-500/[0.06] dark:text-gray-200"
      }
    >
      {children}
    </div>
  );
}
