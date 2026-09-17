"use client";

import type { FC } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Tooltip from "@/components/ui/tooltip/Tooltip";
import {
  BoltIcon,
  BoxCubeIcon,
  ChatIcon,
  DocsIcon,
  EnvelopeIcon,
  GroupIcon,
  LockIcon,
  PlugInIcon,
  ShootingStarIcon,
  TaskIcon,
  UserCircleIcon,
  UserIcon,
} from "@/icons";

type SettingsItem = {
  href: string;
  label: string;
  icon: FC;
  available?: boolean;
};

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: "Worker",
    items: [
      { href: "/settings/identity", label: "Identity", icon: UserCircleIcon, available: true },
      { href: "/settings/role", label: "Role", icon: TaskIcon, available: true },
      { href: "/settings/agent-configuration", label: "Agent configuration", icon: BoltIcon, available: true },
      { href: "/settings/knowledge", label: "Knowledge", icon: DocsIcon, available: true },
      { href: "/settings/skills", label: "Skills", icon: ShootingStarIcon, available: true },
    ],
  },
  {
    title: "Capabilities",
    items: [
      { href: "/settings/tools", label: "Tools", icon: BoxCubeIcon, available: true },
      { href: "/settings/integrations", label: "Integrations", icon: PlugInIcon, available: true },
      { href: "/settings/channels", label: "Channels", icon: ChatIcon, available: true },
    ],
  },
  {
    title: "Controls",
    items: [
      { href: "/settings/guardrails", label: "Guardrails", icon: LockIcon, available: true },
      { href: "/settings/email-domains", label: "Email domains", icon: EnvelopeIcon, available: true },
      { href: "/settings/manager", label: "Human manager", icon: UserIcon, available: true },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/settings/users", label: "User management", icon: GroupIcon, available: true },
    ],
  },
];

/**
 * Borrows the app sidebar's `menu-item`/`menu-item-inactive` utilities for
 * everything but the active state. A row of settings tabs reads as a
 * selection control, not a passive nav list, so it gets its own punchier
 * active treatment (alpha-tinted background, full-saturation text) rather
 * than the sidebar's flatter `menu-item-active` (cream bg, darkened text) —
 * the same distinction the reference design makes between its main nav and
 * its settings tabs.
 */
function navItemClass(active: boolean, disabled: boolean) {
  return `menu-item group min-h-10 text-sm ${
    active
      ? "bg-brand-500/10 text-brand-600 font-semibold dark:bg-brand-500/15 dark:text-brand-400"
      : "menu-item-inactive"
  } ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}

export default function SettingsNav() {
  const pathname = usePathname();
  const activeHref = SETTINGS_SECTIONS.flatMap((section) => section.items)
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label="Settings sections" className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:block lg:space-y-6">
      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.title} className="min-w-0 space-y-0.5">
          <h2 className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {section.title}
          </h2>
          {section.items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            const glyph = (
              <span
                className={`flex size-6 shrink-0 items-center justify-center [&>svg]:size-5 ${
                  active ? "menu-item-icon-active" : "menu-item-icon-inactive"
                }`}
              >
                <Icon />
              </span>
            );
            if (item.available) {
              return (
                <Link key={item.href} href={item.href} className={navItemClass(active, false)}>
                  {glyph}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }
            return (
              <div key={item.href} className="w-full">
                <Tooltip content="Coming soon" placement="right">
                  <span className={navItemClass(false, true)} aria-disabled="true" tabIndex={0}>
                    {glyph}
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto hidden text-xs sm:inline">Soon</span>
                  </span>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
