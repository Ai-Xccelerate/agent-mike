import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@openai/agents";
import { buildAgentTools, CRM_LOOKUP_TOOL_NAME } from "@/lib/agent";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import type { IntegrationConnection } from "@/lib/tools-integrations/connection-repository";

vi.mock("@/lib/tools-integrations/connection-repository", () => ({
  getConnectionForOrg: vi.fn(),
}));

const getConnectionForOrgMock = vi.mocked(getConnectionForOrg);

function isWebSearchTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string; providerData?: { type?: string } };
  return (
    candidate.type === "hosted_tool" &&
    candidate.name === "web_search" &&
    candidate.providerData?.type === "web_search"
  );
}

function isCrmLookupTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === CRM_LOOKUP_TOOL_NAME;
}

function activeZohoConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "org-1",
    integrationType: "crm",
    system: "zoho",
    composioAuthConfigId: "ac_test",
    composioConnectedAccountId: "ca_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

describe("agent internet_search tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
  });

  it("passes a web_search hosted tool into Agent when internet_search is enabled", async () => {
    const tools = await buildAgentTools({ toolsConfig: { internet_search: true } }, "org-1");
    const agent = new Agent({
      name: "Worker",
      instructions: "Help the user.",
      tools,
    });

    expect(tools.some(isWebSearchTool)).toBe(true);
    expect(tools.some(isCrmLookupTool)).toBe(false);
    expect(agent.tools.some(isWebSearchTool)).toBe(true);
  });

  it("does not pass web_search into Agent when internet_search is disabled", async () => {
    const tools = await buildAgentTools(
      { toolsConfig: { internet_search: false, browser_use: true } },
      "org-1",
    );
    const agent = new Agent({
      name: "Worker",
      instructions: "Help the user.",
      tools,
    });

    expect(tools).toEqual([]);
    expect(agent.tools).toEqual([]);
  });
});

describe("agent CRM lookup tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
  });

  it("includes the CRM lookup tool when the org has an active Zoho connection", async () => {
    getConnectionForOrgMock.mockResolvedValue(activeZohoConnection());

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(getConnectionForOrgMock).toHaveBeenCalledWith("org-1", "crm");
    expect(tools.some(isCrmLookupTool)).toBe(true);
  });

  it("omits the CRM lookup tool when there is no connection", async () => {
    getConnectionForOrgMock.mockResolvedValue(null);
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isCrmLookupTool)).toBe(false);
  });

  it("omits the CRM lookup tool when the connection is still pending", async () => {
    getConnectionForOrgMock.mockResolvedValue(activeZohoConnection({ status: "pending" }));
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isCrmLookupTool)).toBe(false);
  });
});
