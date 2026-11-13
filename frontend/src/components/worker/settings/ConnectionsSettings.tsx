"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppsSettings from "@/components/worker/settings/AppsSettings";
import ConnectorsSettings from "@/components/worker/settings/ConnectorsSettings";
import EmailConnections from "@/components/worker/settings/EmailConnections";
import ToolsSettings from "@/components/worker/settings/ToolsSettings";
import { CONNECTION_TABS, connectionsHref, DEFAULT_CONNECTION_TAB, isConnectionTab } from "@/lib/connections";

/**
 * Settings > Connections: everything the worker connects to or can use, in one place. It used to be three Settings
 * entries (Tools, Integrations, Connectors) with mail split across two of them. Each tab keeps its own page title.
 *
 * The tab is in the address (?tab=), so each part can be linked to and the old addresses can redirect to it. Tabs are
 * links, so the unsaved-changes guard on Tools still asks before you leave it.
 */
export default function ConnectionsSettings() {
  const requested = useSearchParams().get("tab");
  const tab = isConnectionTab(requested) ? requested : DEFAULT_CONNECTION_TAB;

  return (
    <div className="space-y-5 md:space-y-6">
      <nav aria-label="Connections: email, apps, tools and connectors" className="no-scrollbar overflow-x-auto">
        <div className="flex min-w-max gap-1 border-b border-gray-200 dark:border-white/[0.08]">
          {CONNECTION_TABS.map((item) => {
            const active = item.id === tab;
            return (
              <Link
                key={item.id}
                href={connectionsHref(item.id)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`focus-ring -mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out ${
                  active
                    ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                    : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="space-y-5 md:space-y-6" data-aix-id="AIX-163">
        {tab === "email" && <EmailConnections />}
        {tab === "apps" && <AppsSettings />}
        {tab === "tools" && <ToolsSettings />}
        {tab === "connectors" && <ConnectorsSettings />}
      </div>
    </div>
  );
}
