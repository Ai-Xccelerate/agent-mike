"use client";

/**
 * A list's search, in its sticky bar: typed text is sent once the typing
 * pauses (and replaces the address rather than pushing a step per letter),
 * `/` puts the cursor in it from anywhere on the page, and the × clears it.
 *
 * The text follows the address too: Back to an earlier search shows that
 * search in the box, not whatever was typed last.
 */

import { useEffect, useRef, useState } from "react";

import { SearchIcon, XIcon } from "@/components/common/icons";
import { useDebounced } from "@/hooks/useDebounced";
import { FOCUS_SEARCH_EVENT } from "@/layout/shortcuts";

export default function SearchBox({
  value,
  onSearch,
  label,
  placeholder,
  className = "",
}: {
  /** The search in the address. */
  value: string;
  /** A settled search, trimmed. */
  onSearch: (text: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // The address moved on its own (Back, a cleared filter): the box follows.
  if (value !== seen) {
    setSeen(value);
    if (value !== text.trim()) setText(value);
  }
  const settled = useDebounced(text.trim(), 250);
  const box = useRef<HTMLInputElement>(null);
  const send = useRef(onSearch);
  useEffect(() => {
    send.current = onSearch;
  });

  useEffect(() => {
    if (settled !== value) send.current(settled);
    // Only a settled change of the text sends; the address catching up does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      if (!box.current) return;
      event.preventDefault();
      box.current.focus();
      box.current.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocus);
  }, []);

  return (
    <div className={`relative min-w-0 flex-1 basis-44 sm:max-w-[17rem] ${className}`}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
      />
      <input
        ref={box}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            setText("");
          }
        }}
        aria-label={label}
        aria-keyshortcuts="/"
        placeholder={placeholder}
        className="field h-10 w-full bg-white pl-9 pr-9 max-sm:h-11 dark:bg-white/[0.03]"
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText("");
            box.current?.focus();
          }}
          aria-label="Clear the search"
          className="focus-ring absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08]"
        >
          <XIcon className="size-4" />
        </button>
      ) : (
        <kbd aria-hidden="true" className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 max-lg:hidden">
          /
        </kbd>
      )}
    </div>
  );
}
