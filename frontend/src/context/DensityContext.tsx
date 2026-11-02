"use client";

/**
 * UI density preference.
 *
 * Same shape as `ThemeContext`: the value lives in `localStorage`, so it is read
 * through `useSyncExternalStore` rather than pulled into React state by a
 * mount effect. See the note there for why that matters for hydration.
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

export type Density = "default" | "comfortable" | "compact";

type DensityContextType = {
  density: Density;
  setDensity: (density: Density) => void;
};

const DensityContext = createContext<DensityContextType | undefined>(undefined);

const STORAGE_KEY = "density";
/** Same-tab notification; `storage` only fires in *other* tabs. */
const CHANGE_EVENT = "aix:density";

function readDensity(): Density {
  if (typeof window === "undefined") return "default";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "comfortable" || saved === "compact" || saved === "default"
    ? saved
    : "default";
}

// Cached so `getSnapshot` is not a `localStorage` read on every render.
let cached: Density | null = null;

function snapshot(): Density {
  if (cached === null) cached = readDensity();
  return cached;
}

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => {
    cached = null;
    onStoreChange();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const DensityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const density = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "default" as Density,
  );

  const setDensity = useCallback((next: Density) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
};

export const useDensity = () => {
  const context = useContext(DensityContext);
  if (context === undefined) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
};
