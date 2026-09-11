import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@openai/agents";
import {
  buildAgentTools,
  CRM_LOOKUP_FAILURE_MESSAGE,
  CRM_LOOKUP_RETRY_BACKOFF_MS,
  CRM_LOOKUP_TOOL_NAME,
  executeCrmLookup,
  executeLinearSearch,
  LINEAR_LOOKUP_FAILURE_MESSAGE,
  LINEAR_LOOKUP_RETRY_BACKOFF_MS,
  LINEAR_LOOKUP_TOOL_NAME,
  LINEAR_SEARCH_ISSUES_SLUG,
  LINEAR_TOOLKIT_VERSION,
  ZOHO_SEARCH_CONTACTS_SLUG,
  ZOHO_TOOLKIT_VERSION,
} from "@/lib/agent";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import type { IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

vi.mock("@/lib/tools-integrations/connection-repository", () => ({
  getConnectionForOrg: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/composio-client", () => ({
  executeTool: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({
  logToolCall: vi.fn(),
}));

const getConnectionForOrgMock = vi.mocked(getConnectionForOrg);
const executeToolMock = vi.mocked(executeTool);
const logToolCallMock = vi.mocked(logToolCall);

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

function isLinearLookupTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === LINEAR_LOOKUP_TOOL_NAME;
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

function activeLinearConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    organizationId: "org-1",
    integrationType: "project_management",
    system: "linear",
    composioAuthConfigId: "ac_linear_test",
    composioConnectedAccountId: "ca_linear_test",
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

describe("CRM lookup retry-once and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs success on the first call and does not retry", async () => {
    const payload = { data: { contacts: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeCrmLookup("alice", "org-1", "ca_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      ZOHO_SEARCH_CONTACTS_SLUG,
      { word: "alice" },
      { connectedAccountId: "ca_test", userId: "org-1", version: ZOHO_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CRM_LOOKUP_TOOL_NAME,
      input: { query: "alice" },
      output: payload,
      status: "success",
    });
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { contacts: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeCrmLookup("bob", "org-1", "ca_test");
    await vi.advanceTimersByTimeAsync(CRM_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CRM_LOOKUP_TOOL_NAME,
      input: { query: "bob" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeCrmLookup("carol", "org-1", "ca_test");
    await vi.advanceTimersByTimeAsync(CRM_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(CRM_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CRM_LOOKUP_TOOL_NAME,
      input: { query: "carol" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});

describe("agent Linear lookup tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
  });

  it("includes the Linear lookup tool when the org has an active Linear connection", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "project_management" ? activeLinearConnection() : null,
    );

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(getConnectionForOrgMock).toHaveBeenCalledWith("org-1", "project_management");
    expect(tools.some(isLinearLookupTool)).toBe(true);
    expect(tools.some(isCrmLookupTool)).toBe(false);
  });

  it("omits the Linear lookup tool when there is no connection", async () => {
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isLinearLookupTool)).toBe(false);
  });

  it("omits the Linear lookup tool when the connection is still pending", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "project_management" ? activeLinearConnection({ status: "pending" }) : null,
    );
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isLinearLookupTool)).toBe(false);
  });
});

describe("Linear issue search retry-once and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs success on the first call and does not retry", async () => {
    const payload = { data: { issues: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeLinearSearch("ENG-1", "org-1", "ca_linear_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      LINEAR_SEARCH_ISSUES_SLUG,
      { query: "ENG-1" },
      { connectedAccountId: "ca_linear_test", userId: "org-1", version: LINEAR_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: LINEAR_LOOKUP_TOOL_NAME,
      input: { query: "ENG-1" },
      output: payload,
      status: "success",
    });
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { issues: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeLinearSearch("bug", "org-1", "ca_linear_test");
    await vi.advanceTimersByTimeAsync(LINEAR_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: LINEAR_LOOKUP_TOOL_NAME,
      input: { query: "bug" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeLinearSearch("timeout", "org-1", "ca_linear_test");
    await vi.advanceTimersByTimeAsync(LINEAR_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(LINEAR_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: LINEAR_LOOKUP_TOOL_NAME,
      input: { query: "timeout" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});
