export interface ToolDefinition {
  id: string;
  name: string;
  requiresAuth: boolean;
}

export interface IntegrationDefinition {
  id: string;
  integrationType: string;
  system: string;
  requiresAuth: boolean;
}

export const TOOLS: ToolDefinition[] = [
  { id: "internet_search", name: "Internet Search", requiresAuth: false },
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  { id: "crm_zoho", integrationType: "crm", system: "zoho", requiresAuth: true },
];

export function getTool(toolId: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.id === toolId);
}

export function getIntegration(integrationId: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((integration) => integration.id === integrationId);
}
