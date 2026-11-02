/**
 * The modal layers open right now, the last opened on top: Persuade's dialogs
 * (`Dialog`), the design system's `Modal` (every confirmation, Share, the
 * shortcuts) and the command palette.
 *
 * Only the layer on top traps focus and answers Escape; the one underneath
 * waits and takes over when the top one closes. Two traps on one page pulled
 * focus from each other for ever ("Maximum call stack size exceeded", seen when
 * the outcome opened over a signing package), and Escape closed the layer
 * underneath as well as -- or instead of -- the one on top. One stack across
 * the three, because they open over each other: "Void this signing?" (a
 * `Modal`) over the signing package (a `Dialog`), the palette over either.
 *
 * Module state, as the focus it arbitrates is: there is one document.
 */

import { useEffect, useState } from "react";

const layers: symbol[] = [];

/** Puts `token` on top until the returned function takes it off (wherever it is by then). */
export function openLayer(token: symbol): () => void {
  layers.push(token);
  return () => {
    const at = layers.lastIndexOf(token);
    if (at >= 0) layers.splice(at, 1);
  };
}

/** Whether `token` is the layer on top: the one that holds focus and answers Escape. */
export function isTopLayer(token: symbol): boolean {
  return layers[layers.length - 1] === token;
}

/** How many modal layers are open (for a test, and for code that must stay out of their way). */
export function openLayerCount(): number {
  return layers.length;
}

/**
 * This component's place on the stack while `open`. Call it before the
 * effects that ask `isTopLayer`, so they run with the layer already on it.
 */
export function useModalLayer(open: boolean): symbol {
  const [token] = useState(() => Symbol("modal-layer"));
  useEffect(() => {
    if (!open) return;
    return openLayer(token);
  }, [open, token]);
  return token;
}
