"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

type WorkerIdentityContextValue = {
  profile: WorkerProfile | null;
};

const WorkerIdentityContext = createContext<WorkerIdentityContextValue>({ profile: null });
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function avatarMimeType(url: string): string {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function absoluteAvatarUrl(url: string): string {
  if (url.startsWith("/api/v1/") && API_BASE) return `${API_BASE}${url}`;
  return new URL(url, window.location.origin).href;
}

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
  const defaultFaviconRef = useRef<{ href: string; type: string } | null>(null);
  const ownLinkRef = useRef<HTMLLinkElement | null>(null);
  useEffect(() => {
    if (!profile) return;
    const frameworkLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]:not([data-worker-avatar-favicon])'),
    );
    if (defaultFaviconRef.current === null) {
      const defaultLink = frameworkLinks[0];
      defaultFaviconRef.current = {
        href: defaultLink?.href ?? "",
        type: defaultLink?.type ?? "",
      };
    }

    const usingAvatar = Boolean(profile.avatarUrl);
    const href = usingAvatar
      ? absoluteAvatarUrl(profile.avatarUrl ?? "")
      : defaultFaviconRef.current.href;
    const type = usingAvatar ? avatarMimeType(href) : defaultFaviconRef.current.type;

    // Chrome can prefer Next's typed SVG icon over a later untyped link.
    // Point the framework-managed icon at the avatar too, but never remove it:
    // removal desynchronizes React's hoisted-head bookkeeping.
    for (const frameworkLink of frameworkLinks) {
      frameworkLink.href = href;
      if (type) frameworkLink.type = type;
      else frameworkLink.removeAttribute("type");
    }

    ownLinkRef.current?.remove();
    if (!href) {
      ownLinkRef.current = null;
      return;
    }

    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    link.type = type;
    link.dataset.workerAvatarFavicon = "true";
    document.head.appendChild(link);
    ownLinkRef.current = link;

    return () => {
      link.remove();
      if (ownLinkRef.current === link) ownLinkRef.current = null;
      for (const frameworkLink of frameworkLinks) {
        frameworkLink.href = defaultFaviconRef.current?.href ?? "";
        const defaultType = defaultFaviconRef.current?.type;
        if (defaultType) frameworkLink.type = defaultType;
        else frameworkLink.removeAttribute("type");
      }
    };
  }, [profile]);

  return <WorkerIdentityContext.Provider value={{ profile }}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}
