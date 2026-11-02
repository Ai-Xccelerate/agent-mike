"use client";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { isTopLayer, useModalLayer } from "@/components/ui/dialog/stack";
import { closestThrough, LayerLevelContext, within } from "@/components/ui/floating/layers";

/** How long the dialog stays mounted after `isOpen` goes false, to fade out. */
const EXIT_MS = 150;

const never = () => () => {};

/**
 * True in the browser once hydration is done; false on the server and during
 * hydration itself, when there is no `document.body` to portal into that the
 * server's HTML agreed on. A dialog open on arrival (the templates page's
 * `?open=`) therefore appears one frame after hydration instead of mismatching.
 */
function useCanPortal(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
  /** Accessible name for the dialog (announced to assistive tech). */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
  ariaLabel = "Dialog",
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const canPortal = useCanPortal();
  /*
   * On the modal stack while open (`stack.ts`, shared with `Dialog` and the
   * palette): a confirmation over a dialog is on top of it, so the dialog's
   * focus trap leaves its buttons alone and Escape closes the question, not
   * the dialog it was asked from. Declared before the Escape listener below.
   */
  const layer = useModalLayer(isOpen);

  /*
   * A dialog that covers the page with a 32px backdrop blur should not appear
   * between two frames. `isOpen` alone cannot express that: unmounting on the
   * frame it turns false leaves nothing on screen to animate out, so the phase
   * outlives the prop by exactly the length of the fade.
   *
   * Derived during render rather than in an effect. Opening is not
   * synchronisation with anything external -- it is state that follows a prop,
   * which is the case React's docs put in the render pass and the idiom the rest
   * of this codebase already uses (see `BrandReview`'s `loadedKit`). Only the
   * exit needs an effect, because only the exit waits on a clock.
   *
   * Opacity only, per the motion rules -- no scale, no spring. Under reduced
   * motion the fade is off but the timer still runs, so the dialog leaves at the
   * same moment either way and focus returns predictably.
   */
  const [phase, setPhase] = useState<"closed" | "open" | "leaving">(
    isOpen ? "open" : "closed",
  );
  if (isOpen && phase !== "open") setPhase("open");
  if (!isOpen && phase === "open") setPhase("leaving");

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("closed"), EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      /*
       * Not a key something inside has answered: a list or a menu open in the
       * dialog closes itself on Escape and says so (`preventDefault`). In the
       * app React listens on the document too, so its `stopPropagation` does
       * not keep the key from this listener -- Escape in a list closed the
       * dialog around it as well.
       */
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A layer opened over this one (`stack.ts`) answers first; this one waits.
      if (!isTopLayer(layer)) return;
      /*
       * Only the dialog you are in. A confirmation opened over another dialog
       * -- "Take this link offline?" over Share -- is a second listener on the
       * same document, and Escape closed both: the question and the dialog it
       * was asked from. The one holding focus answers; one underneath it waits.
       * Focus in a list a dialog opened is focus in that dialog, though the
       * list is in <body> (`within`, `closestThrough`).
       */
      const active = document.activeElement;
      const node = modalRef.current;
      if (
        node &&
        active instanceof Element &&
        !within(node, active) &&
        closestThrough(active, '[role="dialog"]')
      )
        return;
      onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, layer]);

  /*
   * The page behind does not scroll under the dialog. Only while open, and put
   * back as it was: every closed modal on a page -- one per library card, one
   * per kit -- used to write `overflow: unset` as it mounted, which released
   * the lock any open dialog held, and the page scrolled behind it.
   */
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Move focus into the dialog on open; restore it to the trigger on close.
  // `canPortal` is a dependency because the dialog is not in the document until
  // it is true: open on arrival, the first run of this found nothing to focus.
  useEffect(() => {
    if (!isOpen || !canPortal) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, canPortal]);

  // Trap Tab focus within the dialog.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const node = modalRef.current;
    if (!node) return;
    const focusables = Array.from(
      node.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeEl = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (activeEl === first || !node.contains(activeEl)) {
        e.preventDefault();
        last.focus();
      }
    } else if (activeEl === last || !node.contains(activeEl)) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (phase === "closed" || !canPortal) return null;
  const leaving = phase === "leaving";

  const contentClasses = isFullscreen
    ? "w-full h-full"
    : "relative w-full rounded-3xl border border-gray-200 glass-float dark:border-gray-800";

  /*
   * Into <body>, not where the dialog is declared. Declared inside a library
   * card it sat in the card's stacking context (`z-10`), under the next card's
   * checkbox (`z-20`) and anything else positioned above it; declared under a
   * transformed or backdrop-blurred ancestor, `fixed` stopped meaning the
   * viewport. React events still bubble through the component tree.
   *
   * Centred while it fits, and from the top when it does not (`safe`): a
   * dialog taller than the window -- Share on a phone -- was centred past its
   * own top edge, where no scrolling could reach its title. The wheel scrolls
   * it, and stops at its ends rather than moving on to the page.
   */
  return createPortal(
    <div
      className={`custom-scrollbar modal fixed inset-0 z-dialog flex items-center-safe justify-center overflow-y-auto overscroll-contain transition-opacity duration-150 ease-out motion-reduce:transition-none ${
        isFullscreen ? "" : "py-4"
      } ${leaving ? "opacity-0" : "animate-surface-in opacity-100"}`}
    >
      {!isFullscreen && (
        <div
          /* A light scrim and a whisper of blur: the page behind stays
             recognisable, so the dialog reads as a step within it rather than
             a different screen (2026-09-30). */
          className="fixed inset-0 h-full w-full bg-gray-900/45 backdrop-blur-[3px] dark:bg-black/65"
          onClick={onClose}
        ></div>
      )}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`${contentClasses} ${className} focus:outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="focus-ring absolute right-4 top-4 z-999 flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 ease-out hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        {/* What it contains opens its menus over it, not under it. */}
        <LayerLevelContext.Provider value="dialog">
          <div>{children}</div>
        </LayerLevelContext.Provider>
      </div>
    </div>,
    document.body,
  );
};
