export interface ToolDefinition {
  id: string;
  name: string;
  requiresAuth: boolean;
}

export interface IntegrationTypeDefinition {
  type: string;
  name: string;
}

export interface IntegrationDefinition {
  id: string;
  integrationType: string;
  system: string;
  requiresAuth: boolean;
}

export const TOOLS: ToolDefinition[] = [
  { id: "browser_use", name: "Browser", requiresAuth: false },
  { id: "internet_search", name: "Internet Search", requiresAuth: false },
  { id: "scribe", name: "Scribe", requiresAuth: false },
  { id: "artifacts", name: "Artifacts", requiresAuth: false },
];

export const INTEGRATION_TYPES: IntegrationTypeDefinition[] = [
  { type: "crm", name: "CRM" },
  { type: "helpdesk", name: "Helpdesk" },
  { type: "ticketing", name: "Ticketing" },
  { type: "project_management", name: "Project Management" },
  { type: "email", name: "Email" },
  { type: "calendar", name: "Calendar" },
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  { id: "crm_zoho", integrationType: "crm", system: "zoho", requiresAuth: true },
  {
    id: "project_management_linear",
    integrationType: "project_management",
    system: "linear",
    requiresAuth: true,
  },
  { id: "email_gmail", integrationType: "email", system: "gmail", requiresAuth: true },
  { id: "email_outlook", integrationType: "email", system: "outlook", requiresAuth: true },
  {
    id: "calendar_googlecalendar",
    integrationType: "calendar",
    system: "googlecalendar",
    requiresAuth: true,
  },
  { id: "helpdesk_jira", integrationType: "helpdesk", system: "jira", requiresAuth: true },
];

export function getTool(toolId: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.id === toolId);
}

export function getIntegrationType(type: string): IntegrationTypeDefinition | undefined {
  return INTEGRATION_TYPES.find((entry) => entry.type === type);
}

export function getIntegration(integrationId: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((integration) => integration.id === integrationId);
}
