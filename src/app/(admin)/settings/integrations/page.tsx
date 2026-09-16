import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import IntegrationConnectionCard from "@/components/worker/settings/IntegrationConnectionCard";
import { cardClass } from "@/components/worker/settings/ui";
import { PlugInIcon } from "@/icons";
import Badge from "@/components/ui/badge/Badge";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

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

      <IntegrationConnectionCard
        integrationType="crm"
        vendors={[{ system: "zoho", label: "Zoho" }]}
        title="Business system of record"
        description="CRM, helpdesk, ticketing, or project-management tool — always a decoupled, external integration, never hard-coded into the worker."
      />
      <IntegrationConnectionCard
        integrationType="project_management"
        vendors={[{ system: "linear", label: "Linear" }]}
        title="Project management"
        description="Linear issues, searchable by the worker — always a decoupled, external integration, never hard-coded into the worker."
      />
      <IntegrationConnectionCard
        integrationType="email"
        vendors={[
          { system: "gmail", label: "Gmail" },
          { system: "outlook", label: "Outlook" },
        ]}
        title="Email"
        description="Search the connected mailbox — always a decoupled, external integration, never hard-coded into the worker."
      />
      <IntegrationConnectionCard
        integrationType="calendar"
        vendors={[{ system: "googlecalendar", label: "Google Calendar" }]}
        title="Calendar"
        description="Search events on the connected calendar — always a decoupled, external integration, never hard-coded into the worker."
      />
    </>
  );
}
