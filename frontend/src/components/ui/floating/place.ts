/**
 * Where a floating surface goes, given where its anchor is: pure arithmetic,
 * so it can be tested without a browser.
 *
 * Every menu here used to decide this for itself, inline and differently --
 * `useFlip` for the editor's menus, a guessed height for the chips -- and none
 * of them moved sideways, so a menu aligned to the start of a control near the
 * right edge ran off the screen. One answer for all of them:
 *
 * * **Flip** to the other side when the preferred one is short of room and the
 *   other has more. Decided from the anchor and the surface's own size, which
 *   do not change when it flips -- deciding from where the surface currently is
 *   changes its own answer and oscillates.
 * * **Shift** along the anchor's edge to stay inside the viewport, keeping a
 *   margin, rather than being cut off.
 * * **Cap** its height at the room on the side it opened to, so a long list
 *   scrolls inside itself instead of running under the edge of the window.
 */

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  /** The side it opened to, after any flip. */
  side: Side;
  /** The room on that side: the most it can be tall (or wide, beside the anchor). */
  maxHeight: number;
  maxWidth: number;
}

export interface PlaceInput {
  anchor: Box;
  /** The surface's own size, measured without any cap. */
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  side?: Side;
  align?: Align;
  /** The gap between the anchor and the surface. */
  offset?: number;
  /** Kept free at the viewport's edges. */
  padding?: number;
  /**
   * Room at the foot of the viewport that the flip decision treats as taken: a
   * page's bottom bar, a phone browser's toolbar. It moves the decision only;
   * a surface that opens downward anyway may still use it.
   */
  reserveBelow?: number;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function clamp(value: number, low: number, high: number): number {
  // When the surface is wider than the room, the start edge wins: its first
  // words are the ones that say what it is.
  return Math.max(low, Math.min(value, high));
}

export function place({
  anchor,
  size,
  viewport,
  side = "bottom",
  align = "start",
  offset = 6,
  padding = 8,
  reserveBelow = 0,
}: PlaceInput): Placement {
  const bottom = anchor.top + anchor.height;
  const right = anchor.left + anchor.width;

  const room: Record<Side, number> = {
    top: anchor.top - offset - padding,
    bottom: viewport.height - bottom - offset - padding,
    left: anchor.left - offset - padding,
    right: viewport.width - right - offset - padding,
  };
  // What the flip decision sees: the foot kept clear.
  const usable: Record<Side, number> = { ...room, bottom: room.bottom - reserveBelow };

  const vertical = side === "top" || side === "bottom";
  const need = vertical ? size.height : size.width;
  const other = OPPOSITE[side];
  const chosen = need > usable[side] && usable[other] > usable[side] ? other : side;
  const space = Math.max(0, room[chosen]);

  let top: number;
  let left: number;
  if (vertical) {
    const height = Math.min(size.height, space);
    top = chosen === "bottom" ? bottom + offset : anchor.top - offset - height;
    const start =
      align === "start"
        ? anchor.left
        : align === "end"
          ? right - size.width
          : anchor.left + anchor.width / 2 - size.width / 2;
    left = clamp(start, padding, viewport.width - padding - size.width);
  } else {
    const width = Math.min(size.width, space);
    left = chosen === "right" ? right + offset : anchor.left - offset - width;
    const start =
      align === "start"
        ? anchor.top
        : align === "end"
          ? bottom - size.height
          : anchor.top + anchor.height / 2 - size.height / 2;
    top = clamp(start, padding, viewport.height - padding - size.height);
  }

  return {
    top,
    left,
    side: chosen,
    maxHeight: vertical ? space : Math.max(0, viewport.height - 2 * padding),
    maxWidth: vertical ? Math.max(0, viewport.width - 2 * padding) : space,
  };
}
