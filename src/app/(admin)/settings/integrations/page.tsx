import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import IntegrationCategorySection from "@/components/worker/settings/IntegrationCategorySection";
import { GmailIcon, GoogleCalendarIcon, LinearLogoIcon, OutlookIcon, ZohoIcon } from "@/icons";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Integrations | AI Worker" };

const iconClass = "size-6";

export default function IntegrationsSettingsPage() {
  return (
    <>
      <SettingsPageHeader
        title="Integrations"
        description="Business systems, project management, email, and calendar this worker can connect to."
      />

      <IntegrationCategorySection
        integrationType="crm"
        vendors={[{ system: "zoho", label: "Zoho", icon: <ZohoIcon className={iconClass} /> }]}
        title="Business system of record"
        description="CRM, helpdesk, ticketing, or project-management tool."
      />
      <IntegrationCategorySection
        integrationType="project_management"
        vendors={[{ system: "linear", label: "Linear", icon: <LinearLogoIcon className={iconClass} /> }]}
        title="Project management"
        description="Linear issues, searchable by the worker."
      />
      <IntegrationCategorySection
        integrationType="email"
        vendors={[
          { system: "gmail", label: "Gmail", icon: <GmailIcon className={iconClass} /> },
          { system: "outlook", label: "Outlook", icon: <OutlookIcon className={iconClass} /> },
        ]}
        title="Email"
        description="Search the connected mailbox."
      />
      <IntegrationCategorySection
        integrationType="calendar"
        vendors={[{ system: "googlecalendar", label: "Google Calendar", icon: <GoogleCalendarIcon className={iconClass} /> }]}
        title="Calendar"
        description="Search events on the connected calendar."
      />
    </>
  );
}
