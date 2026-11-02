/**
 * The app's places, in one registry (LIB-NAV).
 *
 * The sidebar (`AppSidebar`), the ⌘K palette (`CommandPalette`), the `g` + key
 * shortcuts (`useGlobalShortcuts`) and the page head's eyebrow
 * (`PageBreadcrumb`) all read this file, so a page added here is a page that
 * can be found every way at once. Add a page here first -- a page missing from
 * the palette is a page some people never find.
 *
 * Shape, top to bottom, as Artifacts and Persuade draw it:
 *
 * - **Sections** are the sidebar's groups. The first has no title (Home stands
 *   alone); the rest have a small heading. A section is `collapsible` when it
 *   is a library someone opens now and then rather than a daily place.
 * - **Links** are rows: an icon, the name, and optionally a count. `also`
 *   lists the detail pages that light the row (an invoice lights Invoices),
 *   so detail pages need no row of their own.
 * - **Folders** gather a long list under one row (UI elements' twenty-odd
 *   pages) that opens in place.
 * - **Foot** is what people visit now and then: Settings, then Help.
 *
 * Starting a new product: replace SECTIONS with your own places, keep FOOT,
 * and give the daily places a `key` for `g` + key.
 */

import { HomeIcon, InboxIcon, SlidersIcon, SparklesIcon } from "@/components/common/icons";
import { TicketIcon } from "@/icons";

/* ------------------------------------------------------------------ types */

export interface NavCount {
  value: number;
  /** What it counts, said with the name: "Inbox, 4 unread". */
  says: string;
  /** The person's own queue (drawn dark), rather than a quiet total. */
  strong?: boolean;
}

export interface NavLink {
  kind?: "link";
  name: string;
  path: string;
  icon?: React.ReactNode;
  /** Detail pages that light this row: `/invoice-detail` lights Invoices. */
  also?: string[];
  /** Extra words the palette matches on. */
  keywords?: string;
  /** `g` then this key goes here (`useGlobalShortcuts`). */
  key?: string;
  count?: NavCount;
  /** The page's reference ID (AIX-REFERENCE.md), shown in the palette. */
  ref?: string;
  /** Marked "New" in the sidebar. */
  isNew?: boolean;
  /**
   * The section it is said to sit in (the page head's eyebrow, the palette's
   * hint), where its place in the sidebar does not say: a foot row.
   */
  section?: string;
}

export interface NavFolder {
  kind: "folder";
  /** Stable id, for the folder's remembered open state. */
  id: string;
  name: string;
  icon: React.ReactNode;
  items: NavLink[];
}

export type NavEntry = NavLink | NavFolder;

export interface NavSection {
  id: string;
  /** Its heading; the first section has none. */
  title?: string;
  /** A library opened now and then: its heading folds it away. */
  collapsible?: boolean;
  items: NavEntry[];
}

/* ------------------------------------------------------------- helpers */

/** A section and everything under it: `/leads` and `/leads/...`. */
export function under(prefix: string) {
  return (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isFolder(entry: NavEntry): entry is NavFolder {
  return entry.kind === "folder";
}

/** Whether a row is the place on screen: its own page, under it, or a detail page it owns. */
export function isActiveLink(link: NavLink, pathname: string): boolean {
  if (link.path === "/") return pathname === "/";
  if (under(link.path)(pathname)) return true;
  return (link.also ?? []).some((path) => under(path)(pathname));
}

/* ------------------------------------------------------------ the places */

export const HOME_PATH = "/";
export const SETTINGS_PATH = "/settings";

// Knowledge lives under Settings (R14 lists it as one of the ten dedicated
// capability pages), not as a top-level operational section: these four are
// the day-to-day surfaces, not configuration. Assistant is the manager's own
// admin assistant; the worker's customer-facing behaviour is tested from
// Settings > Channels (Playground), not from a permanent slot.
export const SECTIONS: NavSection[] = [
  {
    id: "home",
    items: [
      { name: "Overview", path: HOME_PATH, icon: <HomeIcon />, key: "h", keywords: "home start today dashboard" },
      { name: "Assistant", path: "/assistant", icon: <SparklesIcon />, key: "a", keywords: "ai chat ask manager" },
      { name: "Inbox", path: "/inbox", icon: <InboxIcon />, key: "i", keywords: "mail email messages conversations approvals" },
      { name: "Tickets", path: "/tickets", icon: <TicketIcon />, key: "t", keywords: "jira support issues" },
    ],
  },
];

/** The foot of the sidebar: visited now and then. Help follows it. */
export const FOOT: NavLink[] = [
  { name: "Settings", path: SETTINGS_PATH, icon: <SlidersIcon />, also: ["/playground"], key: "s", keywords: "preferences worker identity knowledge channels guardrails" },
];

/** Every page with a row or a folder entry, in sidebar order, with its section's title. */
export function allPages(): Array<NavLink & { section: string }> {
  const out: Array<NavLink & { section: string }> = [];
  for (const section of SECTIONS) {
    for (const entry of section.items) {
      if (isFolder(entry)) {
        for (const link of entry.items) out.push({ ...link, icon: link.icon ?? entry.icon, section: entry.name });
      } else {
        out.push({ ...entry, section: section.title ?? "Home" });
      }
    }
  }
  for (const link of FOOT) out.push({ ...link, section: link.section ?? "Settings" });
  return out;
}

/** The page on screen, and the section it sits in (the page head's eyebrow). */
export function pageAt(pathname: string): (NavLink & { section: string }) | null {
  const pages = allPages();
  // The most specific match: a detail page's own row before a parent's `also`.
  return (
    pages.find((page) => page.path === pathname) ??
    pages.find((page) => page.path !== "/" && isActiveLink(page, pathname)) ??
    null
  );
}

/** `g` then a key: the places that have one, in sidebar order. */
export const GO_TO: ReadonlyArray<{ key: string; label: string; path: string }> = allPages()
  .filter((page): page is NavLink & { section: string; key: string } => Boolean(page.key))
  .map((page) => ({ key: page.key, label: page.name, path: page.path }));

