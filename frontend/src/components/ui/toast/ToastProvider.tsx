"use client";

/**
 * Transient confirmation for work that finishes away from the control that
 * started it.
 *
 * The gap this fills: an export runs for thirty seconds, so the person who
 * started it has usually scrolled, switched tab, or moved on. When it landed,
 * the only thing that changed was a button label. When it *failed*, nothing
 * changed at all -- `busy` went false, the progress card unmounted, and the
 * artifact looked exactly as it had before anyone pressed anything.
 *
 * Deliberately not used for everything. An action whose result is visible where
 * you are looking already has its feedback: "Copied" belongs on the copy button,
 * not in the corner of the screen. Toasts are for results that arrive after
 * attention has moved, and for destructive actions worth acknowledging.
 *
 * Motion is opacity only, per the design system -- no slide, no scale, no
 * spring -- and it stops entirely under `prefers-reduced-motion`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertIcon,
  CheckCircleIcon,
  CloseIcon,
  ErrorIcon,
  InfoIcon,
} from "@/icons";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastInput {
  variant?: ToastVariant;
  title: string;
  message?: string;
  /**
   * One thing to do about it, offered in the toast itself.
   *
   * Exists for undo. A destructive action that can be taken back is only
   * genuinely reversible if the way back is where the person is already
   * looking -- an undo they have to go and find is a feature nobody uses in
   * the ten seconds they actually want it.
   *
   * The toast is not the only route: the deleted artifacts remain in
   * "Recently deleted" indefinitely, which is what makes this an accelerator
   * rather than the sole means of recovery. That matters for anyone who never
   * sees the toast -- a screen reader user tabbing back to it, or anyone who
   * simply moved on.
   */
  action?: { label: string; onAct: () => void };
}

interface Toast extends ToastInput {
  id: number;
  variant: ToastVariant;
}

/** Long enough to reconsider, and no longer than anyone would want it. */
const UNDO_MS = 12000;

/** Long enough to read a sentence; short enough not to sit in the way. */
const DISMISS_MS: Record<ToastVariant, number> = {
  success: 4500,
  info: 5000,
  warning: 8000,
  // Errors do not disappear on their own. A failure the user did not happen to
  // be looking at is the whole reason this exists.
  error: 0,
};

/** More than three at once is a log, not a notification. */
const MAX_VISIBLE = 3;

const VARIANTS: Record<
  ToastVariant,
  {
    ring: string;
    icon: string;
    node: React.ReactNode;
    role: "status" | "alert";
  }
> = {
  success: {
    ring: "ring-success-500/25",
    icon: "text-success-500",
    node: <CheckCircleIcon className="size-5" />,
    role: "status",
  },
  error: {
    ring: "ring-error-500/25",
    icon: "text-error-500",
    node: <ErrorIcon className="size-5" />,
    role: "alert",
  },
  warning: {
    ring: "ring-warning-500/25",
    icon: "text-warning-500",
    node: <AlertIcon className="size-5" />,
    role: "status",
  },
  info: {
    ring: "ring-blue-light-500/25",
    icon: "text-blue-light-500",
    node: <InfoIcon className="size-5" />,
    role: "status",
  },
};

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast(): (toast: ToastInput) => void {
  const push = useContext(ToastContext);
  if (!push) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return push;
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const style = VARIANTS[toast.variant];
  const [paused, setPaused] = useState(false);
  // A toast offering an action has to outlive the moment it takes to notice it,
  // read it, and decide. Four and a half seconds is right for "saved"; it is
  // not enough to decide whether you meant to delete fifty artifacts.
  const ttl = toast.action ? UNDO_MS : DISMISS_MS[toast.variant];

  useEffect(() => {
    // Hovering holds the toast open. Reading a message that vanishes while you
    // are reaching for it is the classic toast failure.
    if (!ttl || paused) return;
    const timer = setTimeout(onDismiss, ttl);
    return () => clearTimeout(timer);
  }, [ttl, paused, onDismiss]);

  return (
    <div
      role={style.role}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={`animate-fade-in glass-popover pointer-events-auto flex w-full items-start gap-3 rounded-2xl p-4 ring-1 ${style.ring} shadow-theme-lg`}
    >
      <span className={`mt-0.5 shrink-0 ${style.icon}`}>{style.node}</span>
      <div className="min-w-0 flex-1">
        <p className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
          {toast.title}
        </p>
        {toast.message ? (
          <p className="mt-1 text-theme-xs text-gray-600 dark:text-gray-300">
            {toast.message}
          </p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onAct();
              onDismiss();
            }}
            className="focus-ring mt-2 rounded-lg text-theme-xs font-semibold text-brand-ink underline decoration-brand-300 underline-offset-2 transition-colors duration-150 ease-out hover:text-brand-ink dark:text-brand-400 dark:hover:text-brand-300"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="focus-ring -mr-1 -mt-1 shrink-0 rounded-lg p-1 text-gray-500 dark:text-gray-400 transition-colors duration-150 ease-out hover:text-gray-700 dark:hover:text-gray-200"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((input: ToastInput) => {
    setToasts((current) => {
      const toast: Toast = {
        id: (nextId.current += 1),
        variant: input.variant ?? "success",
        title: input.title,
        message: input.message,
        action: input.action,
      };
      // Drop the oldest rather than growing a column that runs off the screen.
      return [...current, toast].slice(-MAX_VISIBLE);
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // The provider value has to be stable, or every consumer re-renders whenever a
  // toast appears -- including the artifact page behind it.
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `pointer-events-none` on the region and `auto` on each card, so the strip
        never swallows a click aimed at the page behind it. Bottom-right, and
        over a dialog (`z-toast`): the toasts raised while one is open are its
        own answers -- "That kit could not be renamed" with the rename dialog
        still up -- and under the scrim they were blurred past reading.
        On a phone they come down from the top instead: a panel there fills the
        screen with its box at the bottom, and "Picked up where you left off"
        covered the Ask AI box.
      */}
      <div className="pointer-events-none fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-toast flex flex-col gap-2 sm:bottom-4 sm:left-auto sm:top-auto sm:w-[min(22rem,calc(100vw-2rem))]">
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
