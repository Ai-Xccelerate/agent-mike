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
  const defaultFaviconHrefsRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (defaultFaviconHrefsRef.current === null) {
      defaultFaviconHrefsRef.current = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
      ).map((link) => link.href);
    }
    const hrefs = profile.avatarUrl ? [profile.avatarUrl] : defaultFaviconHrefsRef.current;
    document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
    hrefs.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      document.head.appendChild(link);
    });
  }, [profile]);

  return <WorkerIdentityContext.Provider value={{ profile }}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}
