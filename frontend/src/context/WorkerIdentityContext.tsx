"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

type WorkerIdentityContextValue = {
  profile: WorkerProfile | null;
};

const WorkerIdentityContext = createContext<WorkerIdentityContextValue>({ profile: null });
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// The favicon fields only, cached so a returning visitor's tab shows their
// real avatar/color immediately instead of the generic robot icon while the
// "/worker" fetch is still in flight. Deliberately NOT the full WorkerProfile:
// this seed only ever feeds the favicon effect below, never WorkerIdentityContext's
// own `profile` value, so a stale cached name/bio/tone can never leak into the
// Settings form (which seeds itself from that `profile` once and never re-seeds).
type FaviconSeed = { avatarUrl: string | null; avatarInitials: string; accentColor: string };
const FAVICON_SEED_KEY = "aix:favicon-seed";

function readFaviconSeed(): FaviconSeed | null {
  try {
    const raw = window.localStorage.getItem(FAVICON_SEED_KEY);
    return raw ? (JSON.parse(raw) as FaviconSeed) : null;
  } catch {
    return null;
  }
}

function writeFaviconSeed(seed: FaviconSeed) {
  try {
    window.localStorage.setItem(FAVICON_SEED_KEY, JSON.stringify(seed));
  } catch {
    // Private browsing / quota exceeded — the favicon just falls back to the
    // default icon until this session's own fetch resolves, same as before.
  }
}

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

/**
 * Mirrors AgentAvatar's own colored-circle-with-initials treatment (same
 * accent color, same initials) so the tab icon reads as the same identity
 * as the sidebar/Identity avatar instead of the app's generic robot icon —
 * that generic icon.svg fallback is what made the favicon never match once
 * a worker had a custom color but no uploaded image yet.
 */
function placeholderFaviconDataUrl(initials: string, accentColor: string): string {
  const text = (initials || "AW").slice(0, 2).toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<circle cx="32" cy="32" r="32" fill="${accentColor}"/>` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="600" ` +
    `fill="#fff">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function WorkerIdentityProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [faviconSeed, setFaviconSeed] = useState<FaviconSeed | null>(() =>
    typeof window === "undefined" ? null : readFaviconSeed(),
  );

  useEffect(() => {
    void apiFetch<WorkerProfile>("/worker")
      .then((next) => {
        setProfile(next);
        const seed = { avatarUrl: next.avatarUrl, avatarInitials: next.avatarInitials, accentColor: next.accentColor };
        setFaviconSeed(seed);
        writeFaviconSeed(seed);
      })
      .catch(() => undefined);

    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (!next) return;
      setProfile(next);
      const seed = { avatarUrl: next.avatarUrl, avatarInitials: next.avatarInitials, accentColor: next.accentColor };
      setFaviconSeed(seed);
      writeFaviconSeed(seed);
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
  }, []);

  // The browser tab icon: the worker's own uploaded avatar image when there
  // is one, otherwise a generated circle in the worker's own accent color
  // and initials (matching AgentAvatar) rather than the app's generic robot
  // icon.svg — that generic fallback is what made the favicon never match
  // the sidebar/Identity avatar for a worker with a custom color but no
  // uploaded image yet. defaultFaviconRef still exists purely to restore the
  // framework's own icon.svg link on unmount (captured once so this never has
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
  //
  // That same per-navigation reconciliation is also why `pathname` is a
  // dependency below even though nothing in this effect reads it: Next
  // re-resolves and re-syncs its own <link rel="icon"> on every client-side
  // route change, independently of this component's render, which silently
  // overwrote our href back to the default robot on every tab switch within
  // (admin)/layout.tsx (which never remounts between routes, so `profile`
  // never changed and this effect never re-ran to fix it back up). Re-running
  // on every pathname change re-applies our href right after Next resets it.
  const pathname = usePathname();
  const defaultFaviconRef = useRef<{ href: string; type: string } | null>(null);
  const ownLinkRef = useRef<HTMLLinkElement | null>(null);
  useEffect(() => {
    const source = profile ?? faviconSeed;
    if (!source) return;
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

    const usingAvatar = Boolean(source.avatarUrl);
    const href = usingAvatar
      ? absoluteAvatarUrl(source.avatarUrl ?? "")
      : placeholderFaviconDataUrl(source.avatarInitials, source.accentColor);
    const type = usingAvatar ? avatarMimeType(href) : "image/svg+xml";

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
  }, [profile, faviconSeed, pathname]);

  return <WorkerIdentityContext.Provider value={{ profile }}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}
