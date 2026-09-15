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
      { href: "/settings/automation", label: "Automation" },
    ],
  },
  {
    title: "Controls",
    items: [
      { href: "/settings/guardrails", label: "Guardrails", available: true },
      { href: "/settings/email-domains", label: "Email domains", available: true },
      { href: "/settings/verification", label: "Verification" },
      { href: "/settings/manager", label: "Human manager", available: true },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/settings/branding", label: "Branding" },
      { href: "/settings/users", label: "User management", available: true },
      { href: "/settings/data", label: "Data" },
    ],
  },
];

function navItemClass(active: boolean, disabled: boolean) {
  const state = active
    ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
    : "text-gray-600 dark:text-gray-400";
  return `flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${state} ${
    disabled ? "cursor-not-allowed opacity-60" : "hover:bg-gray-100 dark:hover:bg-white/5"
  }`;
}

export default function SettingsNav() {
  const pathname = usePathname();
  const activeHref = SETTINGS_SECTIONS.flatMap((section) => section.items)
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label="Settings sections" className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:block lg:space-y-5">
      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.title} className="min-w-0 space-y-0.5">
          <h2 className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                    <span className="ml-auto hidden text-[10px] sm:inline">Soon</span>
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
