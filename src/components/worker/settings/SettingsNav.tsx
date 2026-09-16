"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Tooltip from "@/components/ui/tooltip/Tooltip";

type SettingsItem = {
  href: string;
  label: string;
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
      { href: "/settings/identity", label: "Identity", available: true },
      { href: "/settings/role", label: "Role", available: true },
      { href: "/settings/agent-configuration", label: "Agent configuration", available: true },
      { href: "/settings/knowledge", label: "Knowledge", available: true },
      { href: "/settings/skills", label: "Skills", available: true },
    ],
  },
  {
    title: "Capabilities",
    items: [
      { href: "/settings/tools", label: "Tools", available: true },
      { href: "/settings/integrations", label: "Integrations", available: true },
      { href: "/settings/channels", label: "Channels", available: true },
    ],
  },
  {
    title: "Controls",
    items: [
      { href: "/settings/guardrails", label: "Guardrails", available: true },
      { href: "/settings/email-domains", label: "Email domains", available: true },
      { href: "/settings/manager", label: "Human manager", available: true },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/settings/users", label: "User management", available: true },
    ],
  },
];

/**
 * Borrows the app sidebar's own utilities rather than restating them, so the
 * settings nav and the main nav cannot drift into two different active states.
 */
function navItemClass(active: boolean, disabled: boolean) {
  return `menu-item group min-h-10 text-sm ${
    active ? "menu-item-active font-semibold" : "menu-item-inactive"
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
            if (item.available) {
              return (
                <Link key={item.href} href={item.href} className={navItemClass(active, false)}>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }
            return (
              <div key={item.href} className="w-full">
                <Tooltip content="Coming soon" placement="right">
                  <span className={navItemClass(false, true)} aria-disabled="true" tabIndex={0}>
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
