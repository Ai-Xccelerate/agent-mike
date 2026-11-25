"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FIRST_LINE, SLOW_AFTER_MS, SLOW_LINE, receive, release, startLine, type Line } from "@/lib/waiting-line";

/**
 * The line shown while a reply is being written: the first line at once, then each step the server reports, each held
 * long enough to read (see lib/waiting-line.ts). Resets when a new wait starts.
 */
export function useWaitingLine(active: boolean, serverLabel: string | null): string {
  const [shown, setShown] = useState(FIRST_LINE);
  const state = useRef<Line>(startLine(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((label: string) => {
    const result = receive(state.current, label, performance.now());
    state.current = result.line;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (result.waitMs === 0) {
      setShown(result.line.shown);
      return;
    }
    timer.current = setTimeout(() => {
      state.current = release(state.current, performance.now());
      setShown(state.current.shown);
      timer.current = null;
    }, result.waitMs);
  }, []);

  useEffect(() => {
    if (!active) return;
    state.current = startLine(performance.now());
    setShown(FIRST_LINE);
    const slow = setTimeout(() => push(SLOW_LINE), SLOW_AFTER_MS);
    return () => {
      clearTimeout(slow);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [active, push]);

  useEffect(() => {
    if (active && serverLabel) push(serverLabel);
  }, [active, serverLabel, push]);

  return shown;
}

/**
 * Across the message area from the moment the customer sends until the reply is ready. Not a chat bubble: one card, one
 * line. Motion (the sweep, the star, the shimmer) stops under reduced motion; the words still change.
 *
 * Colour: nothing here is a fixed colour. The star, the sweep and the shimmer's highlight use the `brand` tokens, which the
 * widget sets from each customer's configured accent colour (lib/widget-appearance.ts, brandScale), so EAP's chat is blue
 * and another customer's is theirs. The AIX orange only shows where no accent is set, as in the console.
 */
export function ReplyWaiting({ name, line }: { name: string; line: string }) {
  const slow = line === SLOW_LINE;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="reply-waiting"
      className="eva-wait relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-3.5 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <span className="eva-wait-rail" aria-hidden="true" />
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{name}</div>
      <div className="flex min-h-6 items-center gap-2.5">
        <svg className="eva-wait-spark size-[18px] shrink-0 text-brand-500" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" />
        </svg>
        <span key={line} className="eva-wait-line eva-wait-shimmer text-[15px] font-medium">
          {line}
        </span>
      </div>
      {slow ? <p className="mt-2 pl-7 text-[13px] text-gray-500 dark:text-gray-400">Thanks for waiting. This one needs a little more time.</p> : null}
    </div>
  );
}

/** After the reply is shown, while a handover's ticket is logged: a small line under the reply, not a second card. */
export function TicketWaiting({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="ticket-waiting" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className="eva-wait-ring" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
