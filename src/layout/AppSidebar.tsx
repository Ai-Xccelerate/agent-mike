"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import { useSidebar } from "@/context/SidebarContext";
import { useWorkerIdentity } from "@/context/WorkerIdentityContext";
import { GridIcon, MailIcon, UserCircleIcon } from "@/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

// Knowledge lives under Settings (R14 lists it as one of the ten dedicated
// capability pages), not as a top-level operational section like the two
// below — those are the day-to-day surfaces, not configuration.
//
// Chat (a conversational admin assistant, not yet built) belongs here once
// it exists. It is not Playground — testing the worker's configured agent
// now lives under Settings > Channels, reached without a permanent nav slot.
const primaryNav: { name: string; path: string; icon: React.FC }[] = [
  { name: "Overview", path: "/", icon: GridIcon },
  { name: "Inbox", path: "/inbox", icon: MailIcon },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const showLabels = isExpanded || isHovered || isMobileOpen;
  const settingsActive = pathname.startsWith("/settings");
  const identity = useWorkerIdentity();
  const displayName = identity?.displayName ?? "AI Worker";
  const initials = identity?.avatarInitials ?? "AW";

  return (
    <aside
      data-aix-id="AIX-F1"
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`glass-surface fixed left-0 top-0 z-99999 flex h-screen flex-col border-r border-gray-200 px-3 transition-all duration-300 dark:border-gray-800 ${
        showLabels ? "w-[240px]" : "w-[80px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
    >
      <Link
        href="/"
        title={!showLabels ? displayName : undefined}
        className={`flex h-20 items-center gap-3 px-2 ${showLabels ? "justify-start" : "justify-center"}`}
      >
        <AgentAvatar
          initials={initials}
          size="md"
          accentColor={identity?.accentColor}
          avatarUrl={identity?.avatarUrl}
          status={identity?.status}
          showStatus
        />
        {showLabels && (
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-semibold tracking-tight text-gray-900 dark:text-white">
              {displayName}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">AI Xccelerate</span>
          </span>
        )}
      </Link>

      <nav className="mt-2 flex min-h-0 flex-1 flex-col">
        <ul className="flex flex-col gap-2">
          {primaryNav.map((item) => {
            const active = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  title={!showLabels ? item.name : undefined}
                  className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${
                    showLabels ? "justify-start" : "justify-center"
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center [&>svg]:size-5 ${
                      active ? "menu-item-icon-active" : "menu-item-icon-inactive"
                    }`}
                  >
                    <Icon />
                  </span>
                  {showLabels && <span className="menu-item-text">{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto border-t border-gray-200 pb-5 pt-4 dark:border-gray-800">
          <Link
            href="/settings"
            title={!showLabels ? "Settings" : undefined}
            className={`menu-item group ${settingsActive ? "menu-item-active" : "menu-item-inactive"} ${
              showLabels ? "justify-start" : "justify-center"
            }`}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center [&>svg]:size-5 ${
                settingsActive ? "menu-item-icon-active" : "menu-item-icon-inactive"
              }`}
            >
              <UserCircleIcon />
            </span>
            {showLabels && <span className="menu-item-text">Settings</span>}
          </Link>
        </div>
      </nav>
    </aside>
  );
}
