"use client";

/**
 * Full-bleed pages inside the frame.
 *
 * Most pages sit in the frame's padded, scrolling column. The proposal canvas
 * (the engine's artifact page and editor) is an app of its own: it scrolls its
 * own slides, pins its own bar, and wants the whole height and width the
 * sidebar leaves -- the way the Artifacts editor takes the window. Persuade
 * keeps its sidebar (no focus mode), so instead of a route-level layout the
 * page asks for the bleed while it is mounted: the same address shows the
 * padded outline step and, once the proposal is written, the canvas.
 */

import { createContext, useContext, useLayoutEffect, useState } from "react";

interface FrameMode {
  bleed: boolean;
  setBleed: (bleed: boolean) => void;
}

const FrameModeContext = createContext<FrameMode | null>(null);

export function FrameModeProvider({ children }: { children: React.ReactNode }) {
  const [bleed, setBleed] = useState(false);
  return <FrameModeContext.Provider value={{ bleed, setBleed }}>{children}</FrameModeContext.Provider>;
}

/** Whether the page on screen has asked for the whole frame. */
export function useFrameBleed(): boolean {
  return useContext(FrameModeContext)?.bleed ?? false;
}

/**
 * Take the whole frame while `on` and mounted. A layout effect, so the frame
 * changes before the page paints in the padded column first.
 */
export function useFullBleed(on = true): void {
  const setBleed = useContext(FrameModeContext)?.setBleed;
  useLayoutEffect(() => {
    if (!setBleed || !on) return;
    setBleed(true);
    return () => setBleed(false);
  }, [setBleed, on]);
}
