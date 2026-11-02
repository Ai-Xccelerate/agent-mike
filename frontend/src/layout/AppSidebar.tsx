"use client";

/**
 * The app's frame on a desktop, and its drawer on a phone (AIX-F1).
 *
 * The Artifacts and Persuade sidebar, which since the 2026-09-30 redesign is
 * the whole frame: there is no header bar. Top to bottom: which workspace,
 * search, the places, and at the foot what people visit now and then --
 * **Settings · Reference IDs · Help** -- then you.
 *
 * The places come from the registry (`layout/navigation.tsx`), so the palette,
 * the `g` shortcuts and this list never disagree. The place you are is dark
 * text on a raised white pill, never orange: orange belongs to the page's one
 * primary action. Counts are quiet grey, or dark when they are the person's
 * own queue.
 *
 * The template has more pages than a product will, so two things keep the
 * list short: a library section (`collapsible`) folds under its heading, and a
 * folder gathers a long list (UI elements) under one row. Both remember being
 * opened or closed, and both open on their own when the page on screen is in
 * them, so the place you are is always in sight.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import AgentAvatar from "@/components/aix/AgentAvatar";
import { useWorkerIdentityDisplay } from "@/context/WorkerIdentityContext";
import { ChevronDownIcon, HelpIcon, PanelLeftIcon, XIcon } from "@/components/common/icons";
import SearchTrigger from "@/components/common/SearchTrigger";
import { APP } from "@/config/app";
import { useSidebar } from "@/context/SidebarContext";
import AccountMenu from "@/layout/AccountMenu";
import {
  FOOT,
  HOME_PATH,
  SECTIONS,
  isActiveLink,
  isFolder,
  type NavFolder,
  type NavLink,
  type NavSection,
} from "@/layout/navigation";
import { OPEN_SHORTCUTS_EVENT } from "@/layout/shortcuts";

/* ------------------------------------------------- remembered open state */

const OPEN_KEY = "aix:nav-open";
const OPEN_EVENT = "aix:nav-open";

let cachedOpen: Record<string, boolean> | null = null;
const EMPTY: Record<string, boolean> = {};

function readOpen(): Record<string, boolean> {
  if (cachedOpen) return cachedOpen;
  try {
    cachedOpen = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    cachedOpen = {};
  }
  return cachedOpen;
}

function subscribeOpen(onChange: () => void): () => void {
  const handler = () => {
    cachedOpen = null;
    onChange();
  };
  window.addEventListener(OPEN_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(OPEN_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function writeOpen(changes: Record<string, boolean>): void {
  const next = { ...readOpen(), ...changes };
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(next));
  } catch {
    // A private window refuses storage; the state still changes for now.
  }
  cachedOpen = next;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Which sections and folders are open: remembered, or open by default. */
function useOpenState(): Record<string, boolean> {
  return useSyncExternalStore(subscribeOpen, readOpen, () => EMPTY);
}

function sectionHolds(section: NavSection, pathname: string): boolean {
  return section.items.some((entry) =>
    isFolder(entry) ? entry.items.some((link) => isActiveLink(link, pathname)) : isActiveLink(entry, pathname),
  );
}

/* ---------------------------------------------------------------- rows */

/* The rows' shared look: the place you are is a raised pill. */
const ROW =
  "focus-ring group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-theme-sm font-medium transition-colors duration-150 ease-out max-sm:h-11";
const ROW_ACTIVE =
  "bg-white text-gray-900 shadow-theme-xs ring-1 ring-gray-200 dark:bg-white/[0.08] dark:text-white dark:ring-white/[0.08]";
const ROW_IDLE =
  "text-gray-700 hover:bg-gray-900/[0.04] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04] dark:hover:text-white";
const ICON_ACTIVE = "text-brand-ink dark:text-brand-400";
const ICON_IDLE = "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200";
/* The slot every icon sits in, so a portrait and a line icon line up. */
const ICON_SLOT = "flex size-5 shrink-0 items-center justify-center [&>svg]:size-4.5";

function Row({
  item,
  active,
  showLabels,
  onGo,
}: {
  item: NavLink;
  active: boolean;
  showLabels: boolean;
  /** Chosen: on a phone, the drawer gets out of the way of the page. */
  onGo?: () => void;
}) {
  const count = item.count && Number.isFinite(item.count.value) ? item.count : null;
  // Said with the name ("Inbox, 4 unread"), drawn as a number.
  const name = count ? `${item.name}, ${count.value} ${count.says}` : item.name;
  return (
    <li>
      <Link
        href={item.path}
        // Collapsed to the rail the row is its icon alone, so its name is the label.
        title={showLabels ? undefined : name}
        aria-label={name}
        aria-current={active ? "page" : undefined}
        onClick={onGo}
        className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE} ${showLabels ? "" : "relative justify-center px-0"}`}
      >
        <span className={`${ICON_SLOT} ${active ? ICON_ACTIVE : ICON_IDLE}`}>{item.icon}</span>
        {showLabels ? <span className="min-w-0 flex-1 truncate">{item.name}</span> : null}
        {count && showLabels ? (
          <span
            aria-hidden="true"
            className={`ml-auto min-w-5 shrink-0 rounded-md px-1.5 py-px text-center text-[11px] font-semibold tabular-nums ${
              count.strong ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {count.value > 999 ? "999+" : count.value}
          </span>
        ) : null}
        {!count && item.isNew && showLabels ? (
          <span className="ml-auto shrink-0 rounded-md bg-gray-900/[0.05] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
            New
          </span>
        ) : null}
        {count?.strong && !showLabels ? (
          <span
            aria-hidden="true"
            className="absolute right-2 top-1.5 size-2 rounded-full bg-gray-900 ring-2 ring-white dark:bg-white dark:ring-gray-900"
          />
        ) : null}
      </Link>
    </li>
  );
}

/**
 * A long list under one row, opened in place: a disclosure, its pages
 * indented under a hairline. On the rail it is its icon, and goes to its
 * first page (a pointer that hovers the rail opens the sidebar instead).
 */
function Folder({
  folder,
  pathname,
  open,
  showLabels,
  onGo,
}: {
  folder: NavFolder;
  pathname: string;
  open: boolean;
  showLabels: boolean;
  onGo?: () => void;
}) {
  const holdsActive = folder.items.some((link) => isActiveLink(link, pathname));
  const listId = `nav-folder-${folder.id}`;

  if (!showLabels) {
    const first = folder.items[0];
    return (
      <li>
        <Link
          href={first.path}
          title={folder.name}
          aria-label={folder.name}
          onClick={onGo}
          className={`${ROW} ${holdsActive ? ROW_ACTIVE : ROW_IDLE} justify-center px-0`}
        >
          <span className={`${ICON_SLOT} ${holdsActive ? ICON_ACTIVE : ICON_IDLE}`}>{folder.icon}</span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => writeOpen({ [folder.id]: !open })}
        aria-expanded={open}
        aria-controls={listId}
        className={`${ROW} ${ROW_IDLE} ${holdsActive && !open ? "text-gray-900 dark:text-white" : ""}`}
      >
        <span className={`${ICON_SLOT} ${holdsActive ? ICON_ACTIVE : ICON_IDLE}`}>{folder.icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
        <span className="text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400">{folder.items.length}</span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-gray-400 transition-transform duration-150 ease-out dark:text-gray-500 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <ul id={listId} className="ml-[1.1875rem] mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-2 dark:border-white/[0.08]">
          {folder.items.map((link) => {
            const active = isActiveLink(link, pathname);
            return (
              <li key={link.path}>
                <Link
                  href={link.path}
                  aria-current={active ? "page" : undefined}
                  onClick={onGo}
                  className={`focus-ring flex h-8 items-center rounded-lg px-2.5 text-theme-sm transition-colors duration-150 ease-out max-sm:h-10 ${
                    active ? `${ROW_ACTIVE} font-medium` : "text-gray-600 hover:bg-gray-900/[0.04] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
                  }`}
                >
                  <span className="truncate">{link.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------- sidebar */

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const showLabels = isExpanded || isHovered || isMobileOpen;
  const opened = useOpenState();
  const { displayName, avatarInitials, accentColor, avatarUrl, status } = useWorkerIdentityDisplay();

  const aside = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  /*
   * The place you are is always in sight: arriving on a page inside a folded
   * section or a closed folder (from the palette, a link, `g` + key) opens it.
   * Leaving does not close it again -- what someone opened stays open.
   */
  useEffect(() => {
    const changes: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      if (section.collapsible && sectionHolds(section, pathname) && readOpen()[section.id] !== true) {
        changes[section.id] = true;
      }
      for (const entry of section.items) {
        if (isFolder(entry) && entry.items.some((link) => isActiveLink(link, pathname)) && readOpen()[entry.id] !== true) {
          changes[entry.id] = true;
        }
      }
    }
    if (Object.keys(changes).length) writeOpen(changes);
    // And scrolled to: a page deep in a folder is otherwise below the list's fold.
    const frame = requestAnimationFrame(() => {
      nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  /*
   * On a phone the drawer covers the page, so choosing anything in it closes
   * it -- including search, which would otherwise open the palette with the
   * drawer still open behind it.
   */
  const leaveDrawer = useCallback(() => {
    if (isMobileOpen) toggleMobileSidebar();
  }, [isMobileOpen, toggleMobileSidebar]);
  const openShortcuts = () => {
    leaveDrawer();
    window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
  };

  /*
   * The drawer, from the keyboard: opening it puts focus on its close button,
   * Escape closes it, and closing it puts focus back on what opened it.
   */
  useEffect(() => {
    if (!isMobileOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const drawer = aside.current;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A dialog over the drawer (the palette) takes its own Escape first.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      toggleMobileSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const focus = document.activeElement;
      if (opener && (focus === document.body || drawer?.contains(focus))) opener.focus();
    };
  }, [isMobileOpen, toggleMobileSidebar]);

  return (
    <aside
      ref={aside}
      id="app-sidebar"
      data-aix-id="AIX-F1"
      aria-label="Main"
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      /* Full height on a phone too: the drawer covers the top bar rather than
         sliding out underneath it. The wider 272px drawer is for the phone,
         where a 248px panel leaves an awkward strip of backdrop.

         Closed, below lg, it is also invisible: moved off screen it would still
         hold every link in the tab order. Visibility transitions with the slide,
         so it hides once it has gone, not before.

         Opened over the rail by a pointer it floats over the page rather than
         pushing it (see the layout), so it carries a shadow then, and the rail
         is opaque. */
      className={`sidebar-drawer glass-surface fixed left-0 top-0 z-[60] flex h-dvh flex-col border-r border-gray-200 px-3 pb-3 pt-3.5 text-gray-900 transition-all duration-300 ease-in-out dark:border-white/[0.06] dark:text-gray-100 lg:z-50
        ${showLabels ? "w-[272px] lg:w-[248px]" : "w-[76px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible"}
        ${isExpanded ? "" : "glass-opaque"}
        ${isHovered && !isExpanded && !isMobileOpen ? "lg:[box-shadow:var(--glass-rim),var(--shadow-elevated)]!" : ""}
        lg:translate-x-0`}
    >
      <div className={`flex h-11 shrink-0 items-center gap-2 ${showLabels ? "" : "justify-center"}`}>
        <Link
          href={HOME_PATH}
          onClick={leaveDrawer}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1"
          aria-label={showLabels ? undefined : displayName}
        >
          <AgentAvatar
            initials={avatarInitials}
            size="sm"
            accentColor={accentColor}
            avatarUrl={avatarUrl}
            status={status}
            showStatus
          />
          {showLabels ? (
            <span className="min-w-0">
              <span className="block truncate font-display text-theme-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                {displayName}
              </span>
              <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{APP.workspace}</span>
            </span>
          ) : null}
        </Link>
        {showLabels ? (
          <>
            {/* The phone's way out of the drawer, beside the backdrop tap. */}
            <button
              ref={closeButton}
              type="button"
              onClick={toggleMobileSidebar}
              aria-label="Close menu"
              className="focus-ring flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-900/[0.04] hover:text-gray-800 max-sm:size-11 lg:hidden dark:text-gray-400 dark:hover:bg-white/[0.06]"
            >
              <XIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isExpanded ? "Collapse sidebar" : "Keep sidebar open"}
              aria-keyshortcuts="["
              title={isExpanded ? "Collapse sidebar ([)" : "Keep sidebar open ([)"}
              className="focus-ring hidden size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-900/[0.04] hover:text-gray-800 lg:flex dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <PanelLeftIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <SearchTrigger showLabels={showLabels} onOpen={leaveDrawer} />

      {/* The list keeps room on every side (the negative margin keeps the rows
          where they were), so the active pill's ring and shadow and a keyboard
          focus ring are drawn whole rather than clipped by the scroll box. */}
      <nav
        ref={nav}
        aria-label="Pages"
        className="no-scrollbar -mx-1.5 mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-1"
      >
        {SECTIONS.map((section, index) => {
          const remembered = opened[section.id];
          // A library is folded until opened, unless the page on screen is in it.
          const open = !section.collapsible || (remembered ?? sectionHolds(section, pathname));
          const headingId = `nav-${section.id}`;
          const listId = `nav-list-${section.id}`;
          return (
            <div key={section.id} className={index === 0 ? "" : "mt-4"}>
              {section.title ? (
                showLabels ? (
                  section.collapsible ? (
                    <h2 id={headingId} className="mb-1">
                      <button
                        type="button"
                        onClick={() => writeOpen({ [section.id]: !open })}
                        aria-expanded={open}
                        aria-controls={listId}
                        className="focus-ring group/heading flex h-6 w-full items-center gap-1 rounded-md px-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors duration-150 ease-out hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <span className="flex-1">{section.title}</span>
                        <ChevronDownIcon
                          className={`size-3.5 transition-transform duration-150 ease-out ${open ? "" : "-rotate-90"}`}
                        />
                      </button>
                    </h2>
                  ) : (
                    <h2
                      id={headingId}
                      className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {section.title}
                    </h2>
                  )
                ) : (
                  // On the rail a hairline says "a new group" where a heading would not fit.
                  <div aria-hidden="true" className="mx-3 mb-3 h-px bg-gray-200 dark:bg-white/[0.08]" />
                )
              ) : null}
              {open ? (
                <ul
                  id={listId}
                  aria-labelledby={section.title && showLabels ? headingId : undefined}
                  aria-label={section.title && !showLabels ? section.title : undefined}
                  className="flex flex-col gap-1.5"
                >
                  {section.items.map((entry) =>
                    isFolder(entry) ? (
                      <Folder
                        key={entry.id}
                        folder={entry}
                        pathname={pathname}
                        // Open while it holds the page on screen, until someone closes it.
                        open={opened[entry.id] ?? entry.items.some((link) => isActiveLink(link, pathname))}
                        showLabels={showLabels}
                        onGo={leaveDrawer}
                      />
                    ) : (
                      <Row
                        key={entry.path}
                        item={entry}
                        active={isActiveLink(entry, pathname)}
                        showLabels={showLabels}
                        onGo={leaveDrawer}
                      />
                    ),
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
        <div className="flex-1" />
        <ul className="mt-4 flex flex-col gap-1.5">
          {FOOT.map((item) => (
            <Row
              key={item.path}
              item={item}
              active={isActiveLink(item, pathname)}
              showLabels={showLabels}
              onGo={leaveDrawer}
            />
          ))}
          <li>
            <button
              type="button"
              onClick={openShortcuts}
              aria-keyshortcuts="?"
              aria-label={showLabels ? undefined : "Help"}
              title={showLabels ? "Help and keyboard shortcuts (?)" : "Help (?)"}
              className={`${ROW} ${ROW_IDLE} ${showLabels ? "" : "justify-center px-0"}`}
            >
              <span className={`${ICON_SLOT} ${ICON_IDLE}`}>
                <HelpIcon />
              </span>
              {showLabels ? <span className="flex-1 text-left">Help</span> : null}
            </button>
          </li>
        </ul>
      </nav>

      <div className="mt-2 border-t border-gray-200 pt-2 dark:border-white/[0.06]">
        <AccountMenu compact={!showLabels} onGo={leaveDrawer} />
      </div>
    </aside>
  );
};

export default AppSidebar;
