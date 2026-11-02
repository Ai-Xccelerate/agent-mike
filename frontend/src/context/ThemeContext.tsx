"use client";

/**
 * Theme preference.
 *
 * Both inputs here are external stores, not React state: the saved preference
 * lives in `localStorage` and the resolved theme for "system" lives in a media
 * query. Reading them through `useSyncExternalStore` is what makes this
 * hydration-safe without the read-then-setState-on-mount dance — React uses the
 * server snapshot while hydrating and re-reads immediately afterwards, so there
 * is no mismatch and no cascading render.
 */

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

type Theme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

type ThemeContextType = {
  /** Resolved theme actually applied to the document. */
  theme: Theme;
  /** User preference — "system" follows the OS setting live. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** The no-flash boot script in the root layout reads this key. */
const THEME_KEY = "theme";
const PREF_KEY = "themePreference";
/** Same-tab notification; `storage` only fires in *other* tabs. */
const PREF_EVENT = "aix:theme-preference";

/* -------------------------------------------------------------------------- */
/* Preference store                                                           */
/* -------------------------------------------------------------------------- */

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(PREF_KEY);
  if (saved === "system" || saved === "light" || saved === "dark") return saved;
  // Older builds only wrote the resolved theme, so fall back to it.
  const legacy = window.localStorage.getItem(THEME_KEY);
  return legacy === "dark" || legacy === "light" ? legacy : "light";
}

// Cached so `getSnapshot` is not a `localStorage` read on every render. The
// subscriber clears it before notifying, which is the only way it can change.
let cachedPreference: ThemePreference | null = null;

function preferenceSnapshot(): ThemePreference {
  if (cachedPreference === null) cachedPreference = readPreference();
  return cachedPreference;
}

function subscribePreference(onStoreChange: () => void): () => void {
  const handler = () => {
    cachedPreference = null;
    onStoreChange();
  };
  window.addEventListener(PREF_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(PREF_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/* -------------------------------------------------------------------------- */
/* System colour-scheme store                                                 */
/* -------------------------------------------------------------------------- */

const DARK_QUERY = "(prefers-color-scheme: dark)";

const prefersDarkSnapshot = (): boolean =>
  typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;

function subscribePrefersDark(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/* -------------------------------------------------------------------------- */

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const preference = useSyncExternalStore(
    subscribePreference,
    preferenceSnapshot,
    // Server snapshot: the boot script has already applied the real theme to
    // <html> before React runs, so the markup does not depend on this value.
    () => "light" as ThemePreference,
  );
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    prefersDarkSnapshot,
    () => false,
  );

  const theme: Theme =
    preference === "system" ? (prefersDark ? "dark" : "light") : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    window.localStorage.setItem(PREF_KEY, next);
    window.dispatchEvent(new Event(PREF_EVENT));
  }, []);

  // Pushing the resolved theme out to the document and to storage — a genuine
  // external-system sync, which is what an effect is for.
  useEffect(() => {
    // Always the RESOLVED theme: the no-flash script only understands
    // "light"/"dark", so writing "system" here would break the next cold load.
    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      preference,
      setPreference,
      // The header toggle always lands on an explicit theme — it leaves "system".
      toggleTheme: () => setPreference(theme === "light" ? "dark" : "light"),
    }),
    [theme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
