"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiFetch, WorkerProfile } from "@/lib/worker-api";
import { IDENTITY_UPDATED_EVENT } from "@/lib/use-worker-profile";

type WorkerIdentityContextValue = {
  profile: WorkerProfile | null;
  identitySeed: IdentitySeed | null;
  /** The "/worker" fetch has finished (either way). */
  settled: boolean;
};

const WorkerIdentityContext = createContext<WorkerIdentityContextValue>({ profile: null, identitySeed: null, settled: false });
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// The display-only fields, cached so a returning visitor sees their real
// name/avatar/color immediately — in the sidebar and the tab favicon —
// instead of the generic "AI Worker"/"AW" placeholder while the "/worker"
// fetch is still in flight. Deliberately NOT the full WorkerProfile: this
// seed only ever feeds display fallbacks, never WorkerIdentityContext's own
// `profile` value, so a stale cached bio/tone/role can never leak into the
// Settings form (which seeds itself from that `profile` once and never
// re-seeds).
type IdentitySeed = {
  displayName: string;
  avatarInitials: string;
  accentColor: string;
  avatarUrl: string | null;
  status: WorkerProfile["status"];
};
const IDENTITY_SEED_KEY = "aix:identity-seed";

function toIdentitySeed(profile: WorkerProfile): IdentitySeed {
  return {
    displayName: profile.displayName,
    avatarInitials: profile.avatarInitials,
    accentColor: profile.accentColor,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
  };
}

// Read through useSyncExternalStore rather than a useState initializer:
// the server has no localStorage, so reading it during the first client
// render made the hydrated HTML ("AI Worker") disagree with the client
// ("Mike") and React threw a hydration error. With a null server snapshot,
// hydration matches and the stored seed is applied right after.
const seedListeners = new Set<() => void>();

function subscribeToSeed(listener: () => void) {
  seedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    seedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readSeedRaw(): string | null {
  try {
    return window.localStorage.getItem(IDENTITY_SEED_KEY);
  } catch {
    return null;
  }
}

function parseSeed(raw: string | null): IdentitySeed | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdentitySeed;
  } catch {
    return null;
  }
}

function writeIdentitySeed(seed: IdentitySeed) {
  try {
    window.localStorage.setItem(IDENTITY_SEED_KEY, JSON.stringify(seed));
  } catch {
    // Private browsing / quota exceeded — display just falls back to the
    // generic placeholder until this session's own fetch resolves, same as before.
  }
  seedListeners.forEach((listener) => listener());
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

const DEFAULT_FAVICON_HREF = "/icon.svg";

/** Replaces the app's single tab-icon <link> (created in app/layout.tsx). */
function setAppFavicon(href: string, type: string) {
  document.querySelectorAll("link[data-app-favicon]").forEach((link) => link.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = type;
  link.href = href;
  link.setAttribute("data-app-favicon", "");
  document.head.appendChild(link);
}

export function WorkerIdentityProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [settled, setSettled] = useState(false);
  const seedRaw = useSyncExternalStore(subscribeToSeed, readSeedRaw, () => null);
  const identitySeed = useMemo(() => parseSeed(seedRaw), [seedRaw]);

  useEffect(() => {
    void apiFetch<WorkerProfile>("/worker")
      .then((next) => {
        setProfile(next);
        writeIdentitySeed(toIdentitySeed(next));
      })
      .catch(() => undefined)
      .finally(() => setSettled(true));

    const update = (event: Event) => {
      const next = (event as CustomEvent<WorkerProfile>).detail;
      if (!next) return;
      setProfile(next);
      writeIdentitySeed(toIdentitySeed(next));
    };
    window.addEventListener(IDENTITY_UPDATED_EVENT, update);
    return () => window.removeEventListener(IDENTITY_UPDATED_EVENT, update);
  }, []);

  // The browser tab icon: the worker's own uploaded avatar image when there
  // is one, otherwise a generated circle in the worker's own accent color
  // and initials (matching AgentAvatar) rather than the app's generic robot.
  //
  // This effect is the ONLY writer of the tab icon. There is deliberately no
  // Next metadata icon (see defaultFavicon in app/layout.tsx): Next re-syncs
  // metadata <link rel="icon"> tags on every client-side navigation, and every
  // earlier fix that tried to out-run that reset (re-running on pathname
  // changes, rewriting Next's own link) missed some navigation — most
  // recently query-string-only ones like /assistant?c=…. With no Next-managed
  // icon there is nothing to reset, so this only has to run when the identity
  // itself changes. Don't add a Next icon back (app/icon.svg, `icons` metadata).
  //
  // Mutating an existing <link>'s href is not enough — several browsers cache
  // the tab icon against the element itself and never repaint it just
  // because the attribute changed. Replacing the <link> forces a refetch.
  useEffect(() => {
    const source = profile ?? identitySeed;
    if (!source) return;
    const usingAvatar = Boolean(source.avatarUrl);
    const href = usingAvatar
      ? absoluteAvatarUrl(source.avatarUrl ?? "")
      : placeholderFaviconDataUrl(source.avatarInitials, source.accentColor);
    setAppFavicon(href, usingAvatar ? avatarMimeType(href) : "image/svg+xml");
    // Leaving the admin area (e.g. to /sign-in) goes back to the app icon.
    return () => setAppFavicon(DEFAULT_FAVICON_HREF, "image/svg+xml");
  }, [profile, identitySeed]);

  return (
    <WorkerIdentityContext.Provider value={{ profile, identitySeed, settled }}>{children}</WorkerIdentityContext.Provider>
  );
}

export function useWorkerIdentity() {
  return useContext(WorkerIdentityContext).profile;
}

// For display-only chrome (sidebar, header) that would otherwise flash the
// generic "AI Worker"/"AW" placeholder on every reload while `/worker` is
// in flight: falls back to the cached IdentitySeed first, and only to the
// hardcoded generic defaults if this is the very first visit with nothing
// cached yet. Never use this for anything that reads or writes the full
// profile (e.g. Settings) — use useWorkerIdentity()/useWorkerProfile() there,
// so stale cached data can never masquerade as a freshly loaded profile.
// `fallbackName` lets a page keep its own first-visit wording (e.g. "your
// worker") instead of the sidebar's "AI Worker".
//
// `ready` is false only during the server render / first paint of a visit with
// nothing cached and the fetch still in flight: callers show a blank
// placeholder then, instead of flashing the generic "AI Worker"/"AW".
export function useWorkerIdentityDisplay(fallbackName = "AI Worker") {
  const { profile, identitySeed, settled } = useContext(WorkerIdentityContext);
  const source = profile ?? identitySeed;
  const ready = Boolean(source) || settled;
  return {
    ready,
    displayName: source?.displayName ?? (ready ? fallbackName : ""),
    avatarInitials: source?.avatarInitials ?? (ready ? "AW" : ""),
    accentColor: source?.accentColor,
    avatarUrl: source?.avatarUrl ?? null,
    status: source?.status,
  };
}
