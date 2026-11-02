"use client";

/**
 * An inline notification (LIB-NOTIFICATION): a message that lives in the page
 * until it is dealt with -- dismissed, or acted on. The same tones and glyphs
 * as `Alert`; it adds a close button and one action.
 *
 * For a result that lands after attention has moved (an export finished, a
 * delete to undo), use a toast (`useToast`), which floats in the corner and
 * leaves on its own.
 */

import React, { useState } from "react";

import { XIcon } from "@/components/common/icons";
import { AlertGlyph, TONE_GLYPH, TONE_SURFACE, type MessageTone } from "@/components/ui/alert/AlertGlyph";

interface NotificationProps {
  variant: MessageTone;
  title: string;
  message: React.ReactNode;
  dismissible?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  /** Called after it is dismissed (it hides itself either way). */
  onDismiss?: () => void;
  className?: string;
}

const Notification: React.FC<NotificationProps> = ({
  variant,
  title,
  message,
  dismissible = false,
  actionLabel,
  onAction,
  onDismiss,
  className = "",
}) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`animate-fade-in flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 ${TONE_SURFACE[variant]} ${className}`}
    >
      <span className={`mt-px ${TONE_GLYPH[variant]}`}>
        <AlertGlyph tone={variant} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-theme-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <div className="mt-0.5 text-theme-sm leading-relaxed text-gray-600 dark:text-gray-300">{message}</div>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="focus-ring mt-2 rounded text-theme-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors duration-150 ease-out hover:decoration-gray-600 dark:text-white dark:decoration-white/30 dark:hover:decoration-white/70"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            onDismiss?.();
          }}
          aria-label={`Dismiss: ${title}`}
          className="focus-ring -mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 ease-out hover:bg-gray-900/[0.05] hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
};

export default Notification;
