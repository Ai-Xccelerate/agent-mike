/**
 * Which floating layer belongs to which control, for the questions a portal
 * makes hard: "was that click inside me?", "is focus still in the dialog?".
 *
 * A menu rendered into `<body>` is no longer a DOM descendant of the control
 * that opened it, so `root.contains(event.target)` -- the outside-click test
 * every menu here used -- says a click on the menu's own item is outside it,
 * and a dialog's focus trap pulls focus back out of a list the dialog opened.
 * Each layer records its owner (the element it is anchored to) as it mounts,
 * and `within` follows that link: a node is within a container if it is in
 * it, or in a layer whose owner is within it -- through any number of layers,
 * so a list opened from a menu opened from a dialog is still in the dialog.
 */

import { createContext } from "react";

const owners = new WeakMap<Element, Element>();

/** Marks a layer as belonging to `owner` until the returned function is called. */
export function ownLayer(layer: Element, owner: Element): () => void {
  owners.set(layer, owner);
  return () => {
    if (owners.get(layer) === owner) owners.delete(layer);
  };
}

/** The attribute that marks a floating layer's root in the DOM. */
export const LAYER_ATTRIBUTE = "data-floating-layer";

/**
 * Whether `target` is inside `container`, counting the floating layers that
 * something inside `container` opened.
 */
export function within(container: Node | null | undefined, target: EventTarget | null): boolean {
  if (!container || !(target instanceof Node)) return false;
  let node: Node | null = target;
  // Bounded: a cycle cannot be built through the DOM, but a loop guard is
  // cheaper than proving that every time.
  for (let hop = 0; node && hop < 32; hop += 1) {
    if (container.contains(node)) return true;
    const element: Element | null = node instanceof Element ? node : node.parentElement;
    const layer: Element | null = element?.closest(`[${LAYER_ATTRIBUTE}]`) ?? null;
    const owner: Element | undefined = layer ? owners.get(layer) : undefined;
    if (!owner) return false;
    node = owner;
  }
  return false;
}

/**
 * `Element.closest`, carried on through the layers' owners: the dialog that a
 * list belongs to when the list itself is in <body>.
 */
export function closestThrough(target: Element, selector: string): Element | null {
  let node: Element | null = target;
  for (let hop = 0; node && hop < 32; hop += 1) {
    const found = node.closest(selector);
    if (found) return found;
    const layer: Element | null = node.closest(`[${LAYER_ATTRIBUTE}]`);
    node = layer ? (owners.get(layer) ?? null) : null;
  }
  return null;
}

/**
 * How high a floating layer sits, by where it was opened from.
 *
 * A menu from the page sits over the page's bars (`z-dropdown`); one opened
 * inside a dialog has to sit over that dialog, so a dialog says so to what it
 * contains (`z-dialog-dropdown`). The names are the scale in `globals.css`.
 */
export type LayerLevel = "page" | "dialog";

export const LayerLevelContext = createContext<LayerLevel>("page");
