"use client";

/**
 * A surface that floats over the page, anchored to the control that opened it:
 * a menu, a listbox, a popover, a tooltip.
 *
 * Rendered into `<body>`, outside every stacking context on the way down. Every
 * menu here used to be `absolute` inside the control's own wrapper, and so sat
 * at whatever height that wrapper's ancestors allowed: inside a header that a
 * finished animation had made a stacking context, it went under the next card's
 * full-card button, which took its clicks and its wheel (the Templates brand
 * menu, 2026-10-01); inside a scrolling column or a card with `overflow-hidden`
 * it was cut off. From `<body>` the only things above it are the layers named
 * over it in `globals.css`: dialogs, toasts and tooltips.
 *
 * Positioned `fixed` from the anchor's rect (see `place`): it flips to the side
 * with room, shifts to stay on screen, caps its height to the room it has, and
 * follows the anchor as anything scrolls or resizes. When the anchor scrolls
 * out of its scroll container it is hidden rather than left hanging over
 * whatever is there instead.
 *
 * What a portal costs, and what is done about it:
 *
 * * **Outside-click tests** -- `root.contains(event.target)` -- stop seeing the
 *   surface as inside. The layer records its owner, and `within` (layers.ts)
 *   follows it; every consumer's test uses that.
 * * **Tab order.** The layer is at the end of the document, so Tab from inside
 *   it would leave for the browser's address bar. Leaving it goes through the
 *   anchor instead: focus is put back on the anchor and Tab carries on from
 *   there, to what follows it, as it did when the surface sat after it in the
 *   DOM. `tab="leave"` leaves on any Tab (a menu: Tab closes it); `walk` lets
 *   Tab move through the surface's own controls and leaves from its ends.
 * * **Dialogs.** A layer opened inside one is raised over it, and its focus
 *   trap counts the layer as inside (it uses `within`).
 *
 * React's events still bubble through the component tree, so a key handler on
 * an ancestor -- a dialog's, a drawer's -- still sees keys pressed in the layer.
 */

import { useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { LayerLevelContext, ownLayer } from "./layers";
import { place, type Align, type Side } from "./place";

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const never = () => () => {};

/** False on the server and during hydration, when nothing may be portalled. */
function useCanPortal(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}

/**
 * The ancestors that can hide the anchor by scrolling it out of view: the
 * blocks column, a rail, the page's own scroller. Up to the first fixed
 * ancestor, past which nothing scrolls it.
 */
function clippingAncestors(node: Element): Element[] {
  const found: Element[] = [];
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") found.push(parent);
    if (style.position === "fixed") break;
  }
  return found;
}

/**
 * Whether any of the anchor is still on screen inside everything that clips it.
 * An anchor with no size says nothing either way (jsdom measures everything as
 * zero), so it counts as showing.
 */
function anchorShowing(box: DOMRect, clips: Element[], viewport: { width: number; height: number }): boolean {
  if (box.width === 0 && box.height === 0) return true;
  let top = Math.max(box.top, 0);
  let left = Math.max(box.left, 0);
  let bottom = Math.min(box.bottom, viewport.height);
  let right = Math.min(box.right, viewport.width);
  for (const clip of clips) {
    const rect = clip.getBoundingClientRect();
    top = Math.max(top, rect.top);
    left = Math.max(left, rect.left);
    bottom = Math.min(bottom, rect.bottom);
    right = Math.min(right, rect.right);
  }
  return bottom > top && right > left;
}

function focusTarget(anchor: HTMLElement): HTMLElement | null {
  return anchor.matches(TABBABLE) ? anchor : anchor.querySelector<HTMLElement>(TABBABLE);
}

export interface FloatingProps {
  open: boolean;
  /** What it is placed against, and owned by: usually the button that opens it. */
  anchor: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  /** The side it prefers. It flips when that side is short of room. */
  side?: Side;
  align?: Align;
  /** The gap to the anchor, in pixels. */
  offset?: number;
  /** As wide as the anchor: a select's list under its field. */
  matchWidth?: boolean;
  /** Foot room the flip decision treats as taken (see `place`). */
  reserveBelow?: number;
  /** How Tab leaves it; see the note at the top. */
  tab?: "walk" | "leave";
  /** `tooltip` sits over everything, toasts included. */
  layer?: "menu" | "tooltip";
  className?: string;
}

export function Floating({
  open,
  anchor,
  children,
  side = "bottom",
  align = "start",
  offset = 6,
  matchWidth = false,
  reserveBelow = 0,
  tab = "walk",
  layer = "menu",
  className = "",
}: FloatingProps) {
  const level = useContext(LayerLevelContext);
  const canPortal = useCanPortal();
  const root = useRef<HTMLDivElement>(null);

  /*
   * Placed before the browser paints, so it never shows at the corner first.
   * Written to the element rather than held in state: it is a measurement of
   * the DOM applied back to the DOM, and re-rendering a menu on every scroll
   * frame to tell it where it already is would be the expensive way round.
   */
  useLayoutEffect(() => {
    const node = root.current;
    const target = anchor.current;
    if (!open || !canPortal || !node || !target) return;
    const release = ownLayer(node, target);
    const clips = clippingAncestors(target);
    let frame = 0;

    const update = () => {
      frame = 0;
      const box = target.getBoundingClientRect();
      const viewport = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: window.innerHeight,
      };
      if (matchWidth) node.style.width = `${box.width}px`;
      // Measured uncapped: the cap is the answer, not an input to it.
      node.style.maxHeight = "";
      node.style.maxWidth = "";
      const spot = place({
        anchor: box,
        size: { width: node.offsetWidth, height: node.offsetHeight },
        viewport,
        side,
        align,
        offset,
        reserveBelow,
      });
      node.style.top = `${Math.round(spot.top)}px`;
      node.style.left = `${Math.round(spot.left)}px`;
      node.style.maxHeight = `${Math.floor(spot.maxHeight)}px`;
      node.style.maxWidth = `${Math.floor(spot.maxWidth)}px`;
      node.dataset.side = spot.side;
      node.style.visibility = anchorShowing(box, clips, viewport) ? "" : "hidden";
    };
    const schedule = (event?: Event) => {
      // Its own list scrolling does not move the anchor.
      if (event?.target instanceof Node && node.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(() => schedule());
    observer.observe(target);
    observer.observe(node);
    return () => {
      release();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [open, canPortal, anchor, side, align, offset, matchWidth, reserveBelow]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const node = root.current;
    const target = anchor.current;
    const back = target ? focusTarget(target) : null;
    if (!node || !back) return;
    if (tab === "walk") {
      const stops = Array.from(node.querySelectorAll<HTMLElement>(TABBABLE));
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const edge = at === -1 || (event.shiftKey ? at === 0 : at === stops.length - 1);
      if (!edge) return;
    }
    // Back onto the anchor; a forward Tab's own default then moves past it.
    back.focus({ preventScroll: true });
    if (event.shiftKey) event.preventDefault();
  }

  if (!open || !canPortal) return null;

  const z = layer === "tooltip" ? "z-tooltip" : level === "dialog" ? "z-dialog-dropdown" : "z-dropdown";

  return createPortal(
    <div
      ref={root}
      data-floating-layer=""
      onKeyDown={onKeyDown}
      // Its own width unless it matches the anchor's; a column, so a list in
      // it shrinks to the capped height and scrolls. The box itself takes no
      // pointer: what it holds does, so a tooltip kept mounted while hidden
      // is not an invisible pane over the page.
      style={matchWidth ? undefined : { width: "max-content" }}
      className={`pointer-events-none fixed left-0 top-0 flex flex-col *:pointer-events-auto ${z} ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export default Floating;
