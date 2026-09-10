"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxIcon,
  ChatIcon,
  CheckCircleIcon,
  DocsIcon,
  GridIcon,
  PlugInIcon,
  UserCircleIcon,
  UserIcon,
} from "@/icons";

/**
 * R14: dedicated pages per capability, replacing the single anchor-nav page
 * agent-mike shipped. Ten real routes, not scroll targets on one page.
 */
const sections = [
  { href: "/settings/identity", label: "Identity", icon: UserCircleIcon },
  { href: "/settings/role", label: "Role", icon: DocsIcon },
  { href: "/settings/guardrails", label: "Guardrails", icon: CheckCircleIcon },
  { href: "/settings/manager", label: "Human manager", icon: UserIcon },
  { href: "/settings/knowledge", label: "Knowledge", icon: BoxIcon },
  { href: "/settings/integrations", label: "Integrations", icon: PlugInIcon },
  { href: "/settings/tools", label: "Tools", icon: GridIcon },
  { href: "/settings/channels", label: "Channels", icon: ChatIcon },
  { href: "/settings/agent-configuration", label: "Agent configuration", icon: GridIcon },
  { href: "/settings/users", label: "User management", icon: UserIcon },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6 lg:flex-row">
        <aside className="shrink-0 lg:w-60">
          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {sections.map((section) => {
              const active = pathname === section.href;
              const Icon = section.icon;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className="size-4" />
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-2 md:space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
