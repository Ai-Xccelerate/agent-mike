"use client";

/**
 * The AIX reference overlay (LIB-REFIDS): every element carrying a
 * `data-aix-id` shows its ID as an orange badge, so a page, a block or a frame
 * region can be named precisely ("change AIX-311.2"). See AIX-REFERENCE.md.
 *
 * On or off is a class on <html> (`.aix-ref-mode`, styled in globals.css) and a
 * word in `localStorage`, read through `useSyncExternalStore` like the theme
 * and the density -- so the sidebar's row, the palette's command and the `\`
 * key all show and change the same state.
 */

import { useEffect, useSyncExternalStore } from "react";

const KEY = "aix-ref-mode";
const EVENT = "aix:ref-mode";
const CLASS = "aix-ref-mode";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setReferenceIds(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage refused (a private window): the overlay still turns on for now.
  }
  document.documentElement.classList.toggle(CLASS, on);
  window.dispatchEvent(new Event(EVENT));
}

export function toggleReferenceIds(): void {
  setReferenceIds(!read());
}

/** Whether the overlay is on, kept current; applies the class on mount. */
export function useReferenceIds(): boolean {
  const on = useSyncExternalStore(subscribe, read, () => false);
  useEffect(() => {
    document.documentElement.classList.toggle(CLASS, on);
  }, [on]);
  return on;
}
