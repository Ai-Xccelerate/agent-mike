"use client";

/**
 * A list's state, in the address: its filters, its search, its page and its
 * page size -- so a filtered page is a link someone can send, and Back walks
 * back through what was chosen.
 *
 * Every list in Persuade pages the same way (the layout system's
 * `Pagination`): 25 rows by default, 10/25/50/100 to choose from, and the
 * size someone picks remembered for that list (in this browser, per list) and
 * used whenever the address does not say. Choosing a filter goes back to the
 * first page; choosing a size keeps the first row you were looking at on
 * screen.
 *
 * Filters and pages are pushed (Back undoes them); typing a search replaces,
 * so a word typed letter by letter is one step back, not nine.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export function isPageSize(value: unknown): value is PageSize {
  return typeof value === "number" && (PAGE_SIZES as readonly number[]).includes(value);
}

const SIZE_EVENT = "persuade:page-size";

export function pageSizeKey(list: string): string {
  return `persuade:page-size:${list}`;
}

/**
 * The size remembered for `list`, or null. Storage can be missing or refuse
 * (a private window, blocked site data): then nothing is remembered and the
 * default stands.
 */
export function readPageSize(list: string): PageSize | null {
  try {
    const saved = Number(window.localStorage.getItem(pageSizeKey(list)));
    return isPageSize(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function rememberPageSize(list: string, size: PageSize): void {
  try {
    window.localStorage.setItem(pageSizeKey(list), String(size));
  } catch {
    // Storage refused: the size holds for this visit, through the address.
  }
  window.dispatchEvent(new Event(SIZE_EVENT));
}

function subscribeSize(onChange: () => void) {
  window.addEventListener(SIZE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIZE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A positive whole number from the address, else 1. */
export function pageFrom(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * The page that keeps the first row of the old page on screen when the size
 * changes: row 51 at 25 a page is on page 3; at 50 a page, on page 2.
 */
export function pageKeeping(page: number, from: number, to: number): number {
  const firstRow = (page - 1) * from;
  return Math.floor(firstRow / to) + 1;
}

export interface ListParams<F extends Record<string, string>> {
  /** The filters, from the address, with the defaults filled in. */
  values: F;
  /** 1-based. */
  page: number;
  size: PageSize;
  /** The first row of this page, for `offset=`. */
  offset: number;
  /** Whether any filter differs from its default. */
  filtered: boolean;
  /** Change filters: back to the first page. `replace` for typing. */
  set: (next: Partial<F>, options?: { replace?: boolean }) => void;
  setPage: (page: number, options?: { replace?: boolean }) => void;
  setSize: (size: PageSize) => void;
  /** Every filter back to its default. */
  clear: () => void;
}

/**
 * `list` names the list for its remembered size ("deals", "meetings"), and
 * `defaults` its filters: a filter at its default is left out of the
 * address, so the plain list has the plain address. `defaultSize` is the size
 * when neither the address nor this browser says (a list inside a page, like a
 * deal's timeline, starts shorter than a page of its own).
 */
export function useListParams<F extends Record<string, string>>(
  list: string,
  defaults: F,
  { defaultSize = DEFAULT_PAGE_SIZE }: { defaultSize?: PageSize } = {},
): ListParams<F> {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const remembered = useSyncExternalStore(
    subscribeSize,
    () => readPageSize(list),
    () => null,
  );

  // `defaults` is usually a literal at the call site: compare by content.
  const defaultsKey = JSON.stringify(defaults);
  const searchKey = search?.toString() ?? "";

  const values = useMemo(() => {
    const base = JSON.parse(defaultsKey) as F;
    const params = new URLSearchParams(searchKey);
    const out = { ...base };
    for (const name of Object.keys(base) as Array<keyof F>) {
      const raw = params.get(String(name));
      if (raw !== null) out[name] = raw as F[keyof F];
    }
    return out;
  }, [defaultsKey, searchKey]);

  const params = new URLSearchParams(searchKey);
  const page = pageFrom(params.get("page"));
  const fromAddress = Number(params.get("size"));
  const size: PageSize = isPageSize(fromAddress) ? fromAddress : (remembered ?? defaultSize);
  const filtered = (Object.keys(values) as Array<keyof F>).some(
    (name) => values[name] !== (JSON.parse(defaultsKey) as F)[name],
  );

  const go = useCallback(
    (next: URLSearchParams, replace: boolean) => {
      const text = next.toString();
      const href = `${pathname}${text ? `?${text}` : ""}`;
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router],
  );

  const set = useCallback(
    (next: Partial<F>, options: { replace?: boolean } = {}) => {
      const base = JSON.parse(defaultsKey) as F;
      const out = new URLSearchParams(searchKey);
      for (const [name, value] of Object.entries(next)) {
        if (value === undefined || value === null || value === base[name]) out.delete(name);
        else out.set(name, String(value));
      }
      out.delete("page");
      go(out, Boolean(options.replace));
    },
    [defaultsKey, searchKey, go],
  );

  const setPage = useCallback(
    (to: number, options: { replace?: boolean } = {}) => {
      const out = new URLSearchParams(searchKey);
      if (to <= 1) out.delete("page");
      else out.set("page", String(Math.floor(to)));
      go(out, Boolean(options.replace));
    },
    [searchKey, go],
  );

  const setSize = useCallback(
    (to: PageSize) => {
      rememberPageSize(list, to);
      const out = new URLSearchParams(searchKey);
      out.set("size", String(to));
      const keep = pageKeeping(page, size, to);
      if (keep <= 1) out.delete("page");
      else out.set("page", String(keep));
      go(out, false);
    },
    [list, searchKey, page, size, go],
  );

  const clear = useCallback(() => {
    const base = JSON.parse(defaultsKey) as F;
    const out = new URLSearchParams(searchKey);
    for (const name of Object.keys(base)) out.delete(name);
    out.delete("page");
    go(out, false);
  }, [defaultsKey, searchKey, go]);

  return { values, page, size, offset: (page - 1) * size, filtered, set, setPage, setSize, clear };
}
