"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import { useSidebar } from "@/context/SidebarContext";
import { ChatIcon, DocsIcon, GridIcon, MailIcon, PlugInIcon, UserCircleIcon } from "@/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const navigation: { name: string; path: string; icon: React.FC; badge?: string }[] = [
  { name: "Overview", path: "/", icon: GridIcon },
  { name: "Inbox", path: "/inbox", icon: MailIcon },
  { name: "Chat", path: "/chat", icon: ChatIcon },
  { name: "Knowledge", path: "/knowledge", icon: DocsIcon },
  { name: "Settings", path: "/settings", icon: UserCircleIcon },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const showLabels = isExpanded || isHovered || isMobileOpen;

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
        className={`flex h-20 items-center gap-3 px-2 ${showLabels ? "justify-start" : "justify-center"}`}
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500 font-display text-lg font-bold text-white shadow-cta">
          M
        </span>
        {showLabels && (
          <span className="min-w-0">
            <span className="block font-display text-base font-semibold tracking-tight text-gray-900 dark:text-white">
              Agent Mike
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Support operations</span>
          </span>
        )}
      </Link>

      <nav className="mt-4 flex-1">
        {showLabels && (
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Workspace
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {navigation.map((item) => {
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
                  {showLabels && item.badge && (
                    <span className="ml-auto rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={`mb-5 border-t border-gray-200 pt-4 dark:border-gray-800 ${showLabels ? "px-2" : "px-1"}`}>
        {showLabels ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <AgentAvatar name="Mike" size="sm" showStatus />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">Mike is online</p>
                  <span className="size-2 rounded-full bg-success-500" />
                </div>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">mike@agentmail.to</p>
              </div>
            </div>
            <Link
              href="/settings"
              className="mt-3 flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <PlugInIcon className="size-4" /> Manage agent
            </Link>
          </div>
        ) : (
          <div className="flex justify-center">
            <AgentAvatar name="Mike" size="sm" showStatus />
          </div>
        )}
      </div>
    </aside>
  );
}
