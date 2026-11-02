"use client";

/**
 * A large dialog: portalled, focus-trapped, and closed by Escape.
 *
 * The template `Modal` is right for a confirmation and wrong for a workspace.
 * It renders in place, so a dialog opened from inside a `<form>` is inside that
 * form -- Enter in any of its fields submits the page behind it -- and it sits
 * under whatever stacking context its parent makes. It also finds its focusable
 * elements by `offsetParent`, which a frame never has in jsdom, so its trap
 * cannot be tested at all.
 *
 * So this one:
 *
 * * **Portals to `<body>`**, outside every form and transformed ancestor.
 * * **Traps focus two ways.** Tab and Shift+Tab wrap at the ends; and focus
 *   that escapes anyway -- out of a framed preview, whose key events never
 *   reach this document -- is brought back by a `focusin` on the document.
 *   A list or a menu the dialog opened is in `<body>` too, and counts as
 *   inside it (`within`): pulled back, its arrows had nothing to move.
 * * **Returns focus** to whatever opened it, so closing it does not drop a
 *   keyboard user at the top of the page.
 * * **Stacks.** With one dialog opened over another (a signing package, then
 *   the outcome it asks for), only the one on top traps focus and answers
 *   Escape: two traps pulled focus from each other for ever ("Maximum call
 *   stack size exceeded"), and Escape closed the one underneath. The stack is
 *   shared with `Modal` and the command palette (`stack.ts`): a confirmation
 *   opened over this dialog is on top of it too.
 * * **Leaves on a fade**, like the modal, and not on the frame `open` turns
 *   false.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { isTopLayer, useModalLayer } from "@/components/ui/dialog/stack";
import { LayerLevelContext, within } from "@/components/ui/floating/layers";

const EXIT_MS = 150;

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  'iframe:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * What Tab can land on inside `root`, in order.
 *
 * Filtered to what is rendered where there is layout to ask, and left whole
 * where there is not: a real browser reports no client rects for an element
 * under `display: none`, and jsdom reports none for anything -- so an empty
 * filtered list means "this environment cannot tell", not "nothing is here".
 */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getAttribute("aria-hidden") !== "true" && !node.closest("[inert]"),
  );
  const shown = all.filter((node) => node.getClientRects().length > 0);
  return shown.length > 0 ? shown : all;
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
  className = "",
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  /** The id of the dialog's visible title. */
  labelledBy: string;
  describedBy?: string;
  children: React.ReactNode;
  /** Classes for the panel: its size and its layout. */
  className?: string;
  /** Where focus goes on open. The panel itself when absent. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // On the stack while open; declared first, so the traps below can ask whether it is on top.
  const token = useModalLayer(open);

  const [phase, setPhase] = useState<"closed" | "open" | "leaving">(
    open ? "open" : "closed",
  );
  if (open && phase !== "open") setPhase("open");
  if (!open && phase === "open") setPhase("leaving");

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("closed"), EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /*
   * Focus that got out -- from inside a framed page, most often -- comes back.
   *
   * Declared before the effect that hands focus back on close, and that order
   * is load-bearing: React runs cleanups in declaration order, so this
   * listener is gone before focus is returned to the opener. The other way
   * round, returning focus to the page counted as focus escaping, and it was
   * pulled straight back into a dialog that was closing.
   */
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (event: FocusEvent) => {
      // A dialog opened over this one keeps focus; this one waits underneath.
      if (!isTopLayer(token)) return;
      const node = panel.current;
      const target = event.target as Node | null;
      if (!node || !target || within(node, target)) return;
      (focusablesIn(node)[0] ?? node).focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open, token]);

  // Focus in on open, back out on close.
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const target = initialFocus?.current ?? panel.current;
    target?.focus({ preventScroll: true });
    return () => {
      returnTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  // Escape closes. A control inside that handles Escape itself -- a menu, a
  // tooltip -- marks the event handled and keeps the dialog open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !isTopLayer(token)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, token]);

  // The page behind does not scroll under the dialog.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const node = panel.current;
    if (!node) return;
    const list = focusablesIn(node);
    if (list.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === node)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (phase === "closed" || typeof document === "undefined") return null;
  const leaving = phase === "leaving";

  return createPortal(
    <div
      className={`fixed inset-0 z-dialog flex items-stretch justify-center sm:items-center sm:p-4 lg:p-6 ${
        leaving ? "pointer-events-none" : ""
      }`}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-gray-900/55 backdrop-blur-[6px] transition-opacity dark:bg-black/65 duration-150 ease-out motion-reduce:transition-none ${
          leaving ? "opacity-0" : "animate-surface-in opacity-100"
        }`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`glass-float relative flex flex-col overflow-hidden border outline-none transition-opacity duration-150 ease-out motion-reduce:transition-none sm:rounded-2xl ${
          leaving ? "opacity-0" : "animate-rise opacity-100"
        } ${className}`}
      >
        {/* What it contains opens its menus over it, not under it. */}
        <LayerLevelContext.Provider value="dialog">{children}</LayerLevelContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
