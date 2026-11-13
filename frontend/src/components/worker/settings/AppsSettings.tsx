"use client";

import Image from "next/image";
import IntegrationCategorySection from "@/components/worker/settings/IntegrationCategorySection";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { GoogleCalendarIcon, JiraIcon, LinearLogoIcon, ZohoIcon } from "@/icons";

const iconClass = "size-6";

/**
 * Connections > Apps: the business systems the worker looks things up in and works with. Mail is its own tab, because it
 * is where the worker speaks as itself and Identity depends on it.
 */
export default function AppsSettings() {
  return (
    <>
      <SettingsPageHeader
        title="Apps"
        description="Business systems, helpdesk, project management, calendar and knowledge base this worker can connect to."
      />

      <IntegrationCategorySection
        integrationType="crm"
        vendors={[{ system: "zoho", label: "Zoho", icon: <ZohoIcon className={iconClass} /> }]}
        title="Business system of record"
        description="CRM, helpdesk, ticketing, or project-management tool."
      />
      <IntegrationCategorySection
        integrationType="helpdesk"
        vendors={[{ system: "jira", label: "Jira", icon: <JiraIcon className={iconClass} /> }]}
        title="Helpdesk"
        description="Raise a ticket when the worker hands over, and let customers check their own tickets."
      />
      <IntegrationCategorySection
        integrationType="project_management"
        vendors={[{ system: "linear", label: "Linear", icon: <LinearLogoIcon className={iconClass} /> }]}
        title="Project management"
        description="Linear issues, searchable by the worker."
      />
      <IntegrationCategorySection
        integrationType="calendar"
        vendors={[{ system: "googlecalendar", label: "Google Calendar", icon: <GoogleCalendarIcon className={iconClass} /> }]}
        title="Calendar"
        description="Search events on the connected calendar."
      />
      <IntegrationCategorySection
        integrationType="knowledge_base"
        vendors={[
          {
            system: "confluence",
            label: "Confluence",
            icon: <Image src="/images/integrations/confluence.png" alt="" width={24} height={24} className={iconClass} />,
          },
        ]}
        title="Knowledge base"
        description="Pages the worker searches before answering and grounds its replies in."
      />
    </>
  );
}
