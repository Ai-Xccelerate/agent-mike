/**
 * An inline alert (LIB-ALERT): something true about the page that the person
 * should know before they go on -- a sync that failed, a limit coming up.
 *
 * A tint and a hairline of the tone, the glyph in its colour, the words in ink
 * (the tone is never the only signal: the title says it). Calm enough to sit
 * in a card; for a result that arrives after attention has moved, use a toast
 * (`useToast`) instead.
 */

import Link from "next/link";
import React from "react";

import { AlertGlyph, TONE_GLYPH, TONE_SURFACE } from "./AlertGlyph";

interface AlertProps {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: React.ReactNode;
  /** Whether to show the link under the message. */
  showLink?: boolean;
  linkHref?: string;
  linkText?: string;
  /** A control on the right (a quiet Button: "Reconnect", "Review"). */
  action?: React.ReactNode;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({
  variant,
  title,
  message,
  showLink = false,
  linkHref = "#",
  linkText = "Learn more",
  action,
  className = "",
}) => {
  return (
    <div className={`flex flex-wrap items-start gap-x-3 gap-y-3 rounded-xl border px-4 py-3.5 ${TONE_SURFACE[variant]} ${className}`}>
      <span className={`mt-px ${TONE_GLYPH[variant]}`}>
        <AlertGlyph tone={variant} className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h4 className="text-theme-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <div className="mt-0.5 text-theme-sm leading-relaxed text-gray-600 dark:text-gray-300">{message}</div>
        {showLink && (
          <Link
            href={linkHref}
            className="focus-ring mt-2 inline-block rounded text-theme-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors duration-150 ease-out hover:decoration-gray-600 dark:text-white dark:decoration-white/30 dark:hover:decoration-white/70"
          >
            {linkText}
          </Link>
        )}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 max-sm:pl-8">{action}</div> : null}
    </div>
  );
};

export default Alert;
