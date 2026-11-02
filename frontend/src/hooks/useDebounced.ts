"use client";

import { useEffect, useState } from "react";

/**
 * A value that settles instead of following every keystroke.
 *
 * The search box fed its raw value straight into a query key, so typing one
 * eight-letter word fired eight authenticated requests and threw seven of the
 * responses away. Debouncing is the half of the fix that saves the round trips;
 * `keepPreviousData` on the query is the half that stops the list flickering.
 *
 * 250ms: below roughly 200ms a fast typist still triggers a request per
 * character, and above 350ms the results feel detached from the typing.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
