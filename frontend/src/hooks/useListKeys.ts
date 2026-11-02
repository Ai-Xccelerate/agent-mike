"use client";

/**
 * A list, from the keyboard: `j` and `k` move down and up the rows, `Enter`
 * opens the one you are on, and a page's own letters act on it ("a" adds a
 * meeting to its suggested deal). The row you are on is the one the preview
 * pane shows on a wide screen.
 *
 * Moving puts focus on the row's main link (`data-row-primary`), so a screen
 * reader follows along and `Enter` is the link's own. Every key stands down
 * while someone is typing, holds a modifier, or has a dialog open -- the rule
 * every single-key shortcut here keeps (`isTypingTarget`) -- and a key is
 * only claimed when it acted.
 *
 * Tabbing onto a row, or clicking it, makes it the row you are on too
 * (`rowProps`), so the keys carry on from where the pointer or Tab left off.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { inChord } from "@/layout/chord";
import { isTypingTarget } from "@/layout/shortcuts";

export interface ListKeyAction {
  /** The key, as `KeyboardEvent.key` gives it: "a", "x". */
  key: string;
  /** What it does, for the Help sheet. */
  label: string;
  run: (index: number) => void;
  /** Whether it applies to that row (a meeting already added has no "add"). */
  when?: (index: number) => boolean;
}

interface Options {
  count: number;
  /** The row you are on; -1 for none. */
  active: number;
  setActive: (index: number) => void;
  /** Enter, when focus is not already on a control that Enter presses. */
  onOpen?: (index: number) => void;
  actions?: readonly ListKeyAction[];
  enabled?: boolean;
}

/** Focus the row's main link (or the row) and bring it into view. */
export function focusRow(root: HTMLElement | null, index: number): void {
  const row = root?.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
  if (!row) return;
  const primary = row.querySelector<HTMLElement>("[data-row-primary]") ?? row;
  primary.focus({ preventScroll: true });
  row.scrollIntoView?.({ block: "nearest" });
}

/** The next row for `j` / `k` from `active`, kept on the list. */
export function stepRow(active: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (active < 0) return direction === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, active + direction));
}

export function useListKeys({ count, active, setActive, onOpen, actions = [], enabled = true }: Options) {
  const root = useRef<HTMLElement | null>(null);
  // The latest values for the one listener, so it is not re-bound per render.
  const latest = useRef({ count, active, setActive, onOpen, actions });
  useEffect(() => {
    latest.current = { count, active, setActive, onOpen, actions };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // The second key of "g d" is the frame's: going to Deals, not acting on a row.
      if (inChord()) return;
      const { count: rows, active: at, setActive: move, onOpen: open, actions: own } = latest.current;
      const key = event.key;
      if (key === "j" || key === "k") {
        if (rows === 0) return;
        event.preventDefault();
        const next = stepRow(at, rows, key === "j" ? 1 : -1);
        move(next);
        focusRow(root.current, next);
        return;
      }
      if (key === "Enter") {
        const target = event.target instanceof HTMLElement ? event.target : null;
        // A link or button presses itself; only a row with nothing focused in it opens here.
        if (target?.closest("a, button, [role='button'], summary, input, select, textarea")) return;
        if (at < 0 || !open) return;
        event.preventDefault();
        open(at);
        return;
      }
      if (event.shiftKey) return;
      const action = own.find((candidate) => candidate.key === key);
      if (!action || at < 0 || at >= rows) return;
      if (action.when && !action.when(at)) return;
      event.preventDefault();
      action.run(at);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const rowProps = useCallback(
    (index: number) => ({
      "data-row-index": index,
      "data-active": index === active ? "" : undefined,
      onFocus: () => {
        if (index !== active) setActive(index);
      },
    }),
    [active, setActive],
  );

  return {
    /** Give the list's container this ref, so moving can find its rows. */
    root,
    rowProps,
  };
}

/**
 * The row you are on, kept for the page of rows it was chosen on: a new page,
 * filter or search starts with none (`resetKey` is what identifies the page).
 * Clamped to the rows there are, so a row sorted off the list (a meeting
 * added to its deal) leaves you on the one that took its place.
 */
export function useActiveRow(resetKey: string, count: number): [number, (index: number) => void] {
  const [state, setState] = useState({ key: resetKey, index: -1 });
  const index = state.key === resetKey ? Math.min(state.index, count - 1) : -1;
  const set = useCallback((next: number) => setState({ key: resetKey, index: next }), [resetKey]);
  return [index, set];
}
