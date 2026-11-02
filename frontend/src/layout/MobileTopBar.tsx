"use client";

/**
 * The frame on a phone: the menu, the product, and search (AIX-F2).
 *
 * Below `lg` the sidebar is a drawer, so something has to open it -- and that is
 * all this bar does, with search beside it because the palette is how a phone
 * gets anywhere by name. Each control is a 44px target. Your account is in the
 * drawer, where the sidebar keeps it on a desktop.
 */

import Link from "next/link";

import AgentAvatar from "@/components/aix/AgentAvatar";
import { useWorkerIdentityDisplay } from "@/context/WorkerIdentityContext";
import { OPEN_PALETTE_EVENT } from "@/components/common/CommandPalette";
import { MenuIcon, SearchIcon } from "@/components/common/icons";
import { useSidebar } from "@/context/SidebarContext";
import { HOME_PATH } from "@/layout/navigation";

export default function MobileTopBar() {
  const { toggleMobileSidebar, isMobileOpen } = useSidebar();
  const { displayName, avatarInitials, accentColor, avatarUrl, status } = useWorkerIdentityDisplay();

  return (
    <header
      data-aix-id="AIX-F2"
      className="glass-surface glass-opaque sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-gray-200 px-2 lg:hidden dark:border-white/[0.06]"
    >
      <button
        type="button"
        onClick={toggleMobileSidebar}
        aria-label="Open menu"
        aria-expanded={isMobileOpen}
        aria-controls="app-sidebar"
        className="focus-ring flex size-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-900/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
      >
        <MenuIcon className="size-5" />
      </button>
      <Link href={HOME_PATH} className="focus-ring flex h-11 min-w-0 flex-1 items-center rounded-lg px-1">
        <span className="inline-flex min-w-0 items-center gap-2">
          <AgentAvatar initials={avatarInitials} size="sm" accentColor={accentColor} avatarUrl={avatarUrl} status={status} showStatus />
          <span className="truncate font-display text-base font-semibold tracking-tight text-gray-900 dark:text-white">{displayName}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        aria-label="Search and commands"
        className="focus-ring flex size-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-900/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
      >
        <SearchIcon className="size-5" />
      </button>
    </header>
  );
}
