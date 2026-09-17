"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

type WorkerIdentityContextValue = {
  profile: WorkerProfile | null;
};

const WorkerIdentityContext = createContext<WorkerIdentityContextValue>({ profile: null });

export function WorkerIdentityProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);

  useEffect(() => {
    void apiFetch<WorkerProfile>("/worker").then(setProfile).catch(() => undefined);

    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (next) setProfile(next);
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
  }, []);

  // The browser tab icon: the worker's own uploaded avatar when there is one,
  // the app's own robot icon.svg otherwise (captured once so this never has
  // to guess its URL) — never any other placeholder or stock image.
  //
  // Mutating an existing <link>'s href is not enough — several browsers cache
  // the tab icon against the element itself and never repaint it just
  // because the attribute changed. Removing and re-inserting a fresh <link>
  // forces an actual refetch.
  //
  // Only ever remove/recreate the single <link> THIS effect itself created
  // (tracked via ownLinkRef) — never Next's own default <link rel="icon">
  // (rendered from app/icon.svg). That one is a React-managed "hoistable"
  // head element; ripping it out via raw DOM APIs desyncs React's internal
  // reference to it, and every navigation afterward that tries to reconcile
  // it throws "Cannot read properties of null (reading 'removeChild')" -
  // this crashed on every client-side route change for the rest of the tab's
  // session once this effect had run a single time.
  const defaultFaviconHrefRef = useRef<string | null>(null);
  const ownLinkRef = useRef<HTMLLinkElement | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (defaultFaviconHrefRef.current === null) {
      defaultFaviconHrefRef.current =
        document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "";
    }
    const href = profile.avatarUrl || defaultFaviconHrefRef.current;
    ownLinkRef.current?.remove();
    if (!href) {
      ownLinkRef.current = null;
      return;
    }
    // Browsers prefer the most recently inserted <link rel="icon">, so
    // appending ours after Next's default is enough to win without needing
    // to remove Next's own tag at all.
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    ownLinkRef.current = link;
  }, [profile]);

  return <WorkerIdentityContext.Provider value={{ profile }}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}
