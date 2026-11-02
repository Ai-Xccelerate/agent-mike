"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether a sticky bar is stuck: a one-pixel sentinel sits just above it, and
 * once the sentinel has scrolled out of sight above the bar's sticking line,
 * the bar is over content.
 *
 * `top` is that line, in pixels from the top of the window (the phone's top
 * bar is 56px tall; on a desktop the bar sticks at the top). Observed against
 * the window, which also accounts for the frame's own scrolling `main`: an
 * element clipped by a scroller is not intersecting.
 */
export function useStuck<T extends HTMLElement = HTMLDivElement>(top = 0) {
  const sentinel = useRef<T>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Out of sight *above* the line: stuck. Out of sight below (the bar
        // has not been reached yet): not.
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + top + 1);
      },
      { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [top]);

  return { sentinel, stuck };
}
