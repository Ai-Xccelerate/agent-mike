import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import WidgetInstallCard from "@/components/worker/settings/WidgetInstallCard";
import { cardClass } from "@/components/worker/settings/ui";
import { PlugInIcon } from "@/icons";
import Badge from "@/components/ui/badge/Badge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integrations | AI Worker" };

const platformIntegrations = [
  { name: "OpenAI Agents SDK", detail: "Response generation", status: "Configured" },
  { name: "PostgreSQL", detail: "Conversations and knowledge retrieval", status: "Healthy" },
];

export default function IntegrationsSettingsPage() {
  return (
    <>
      <SettingsPageHeader
        title="Integrations"
        description="Platform services this worker runs on, and where a business system connects."
      />
      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Platform</h2>
        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {platformIntegrations.map((integration) => (
            <div key={integration.name} className="flex items-center gap-4 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <PlugInIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">{integration.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{integration.detail}</p>
              </div>
              <Badge size="sm" color="success">
                {integration.status}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Website widget</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Grouped here with other connected-tool cards — Channels stays pure on/off toggles, nothing to copy-paste.
        </p>
        <div className="mt-4">
          <WidgetInstallCard />
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Business system of record</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          CRM, helpdesk, ticketing, or project-management tool — always a decoupled, external integration, never
          hard-coded into the worker. No business-system connector is configured for this deployment yet.
        </p>
        <span className="mt-4 inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
          Not connected
        </span>
      </section>
    </>
  );
}
