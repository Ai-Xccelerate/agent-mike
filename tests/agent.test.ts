import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@openai/agents";
import {
  buildAgentTools,
  buildInstructions,
  buildSkillsBlock,
  LOAD_SKILL_TOOL_NAME,
  CRM_LOOKUP_FAILURE_MESSAGE,
  CRM_LOOKUP_RETRY_BACKOFF_MS,
  CRM_LOOKUP_TOOL_NAME,
  CALENDAR_LOOKUP_FAILURE_MESSAGE,
  CALENDAR_LOOKUP_RETRY_BACKOFF_MS,
  CALENDAR_LOOKUP_TOOL_NAME,
  executeCalendarSearch,
  buildJiraTextSearchJql,
  executeCrmLookup,
  executeGmailSearch,
  executeJiraSearch,
  executeLinearSearch,
  executeOutlookSearch,
  EMAIL_LOOKUP_FAILURE_MESSAGE,
  EMAIL_LOOKUP_RETRY_BACKOFF_MS,
  EMAIL_LOOKUP_TOOL_NAME,
  GMAIL_LIST_MESSAGES_SLUG,
  GMAIL_TOOLKIT_VERSION,
  GOOGLECALENDAR_EVENTS_LIST_SLUG,
  GOOGLECALENDAR_TOOLKIT_VERSION,
  JIRA_LOOKUP_FAILURE_MESSAGE,
  JIRA_LOOKUP_RETRY_BACKOFF_MS,
  JIRA_LOOKUP_TOOL_NAME,
  JIRA_SEARCH_ISSUES_SLUG,
  JIRA_TOOLKIT_VERSION,
  LINEAR_LOOKUP_FAILURE_MESSAGE,
  LINEAR_LOOKUP_RETRY_BACKOFF_MS,
  LINEAR_LOOKUP_TOOL_NAME,
  LINEAR_SEARCH_ISSUES_SLUG,
  LINEAR_TOOLKIT_VERSION,
  OUTLOOK_SEARCH_MESSAGES_SLUG,
  OUTLOOK_TOOLKIT_VERSION,
  ZOHO_SEARCH_CONTACTS_SLUG,
  ZOHO_TOOLKIT_VERSION,
} from "@/lib/agent";
import { ensureOrganization } from "@/lib/bootstrap";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import type { IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import {
  createCustomSkill,
  deleteCustomSkill,
} from "@/lib/tools-integrations/custom-skills-repository";
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

function isEmailLookupTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === EMAIL_LOOKUP_TOOL_NAME;
}

function isCalendarLookupTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === CALENDAR_LOOKUP_TOOL_NAME;
}

function isJiraLookupTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === JIRA_LOOKUP_TOOL_NAME;
}

function isLoadSkillTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string };
  return candidate.type === "function" && candidate.name === LOAD_SKILL_TOOL_NAME;
}

async function invokeLoadSkill(tools: unknown[], skillId: string): Promise<string> {
  const skillTool = tools.find(isLoadSkillTool) as
    | { invoke: (context: unknown, input: string) => Promise<string> }
    | undefined;
  if (!skillTool) throw new Error("load_skill tool not found");
  return skillTool.invoke(undefined, JSON.stringify({ skillId }));
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

function activeGmailConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    organizationId: "org-1",
    integrationType: "email",
    system: "gmail",
    composioAuthConfigId: "ac_gmail_test",
    composioConnectedAccountId: "ca_gmail_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

function activeOutlookConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    organizationId: "org-1",
    integrationType: "email",
    system: "outlook",
    composioAuthConfigId: "ac_outlook_test",
    composioConnectedAccountId: "ca_outlook_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

function activeGoogleCalendarConnection(
  overrides: Partial<IntegrationConnection> = {},
): IntegrationConnection {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    organizationId: "org-1",
    integrationType: "calendar",
    system: "googlecalendar",
    composioAuthConfigId: "ac_googlecalendar_test",
    composioConnectedAccountId: "ca_googlecalendar_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

function activeJiraConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "66666666-6666-6666-6666-666666666666",
    organizationId: "org-1",
    integrationType: "helpdesk",
    system: "jira",
    composioAuthConfigId: "ac_jira_test",
    composioConnectedAccountId: "ca_jira_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

async function invokeEmailLookup(tools: unknown[], query: string): Promise<string> {
  const emailTool = tools.find(isEmailLookupTool) as
    | { invoke: (context: unknown, input: string) => Promise<string> }
    | undefined;
  if (!emailTool) throw new Error("lookup_email tool not found");
  return emailTool.invoke(undefined, JSON.stringify({ query }));
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

describe("agent Gmail lookup tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
  });

  it("includes the email lookup tool when the org has an active Gmail connection", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "email" ? activeGmailConnection() : null,
    );

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(getConnectionForOrgMock).toHaveBeenCalledWith("org-1", "email");
    expect(tools.some(isEmailLookupTool)).toBe(true);
    expect(tools.some(isCrmLookupTool)).toBe(false);
    expect(tools.some(isLinearLookupTool)).toBe(false);
  });

  it("omits the email lookup tool when there is no connection", async () => {
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isEmailLookupTool)).toBe(false);
  });

  it("omits the email lookup tool when the connection is still pending", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "email" ? activeGmailConnection({ status: "pending" }) : null,
    );
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isEmailLookupTool)).toBe(false);
  });

  it("includes lookup_email for an active Outlook connection and executes OUTLOOK_SEARCH_MESSAGES", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "email" ? activeOutlookConnection() : null,
    );
    executeToolMock.mockResolvedValue({ data: { value: [] }, error: null, successful: true });

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isEmailLookupTool)).toBe(true);

    await invokeEmailLookup(tools, "meeting");
    expect(executeToolMock).toHaveBeenCalledWith(
      OUTLOOK_SEARCH_MESSAGES_SLUG,
      { query: "meeting" },
      { connectedAccountId: "ca_outlook_test", userId: "org-1", version: OUTLOOK_TOOLKIT_VERSION },
    );
  });

  it("still executes GMAIL_LIST_MESSAGES when the connected email vendor is Gmail", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "email" ? activeGmailConnection() : null,
    );
    executeToolMock.mockResolvedValue({ data: { messages: [] }, error: null, successful: true });

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    await invokeEmailLookup(tools, "is:unread");
    expect(executeToolMock).toHaveBeenCalledWith(
      GMAIL_LIST_MESSAGES_SLUG,
      { q: "is:unread" },
      { connectedAccountId: "ca_gmail_test", userId: "org-1", version: GMAIL_TOOLKIT_VERSION },
    );
  });

  it("omits the email lookup tool when the connected system is unrecognized", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "email" ? activeGmailConnection({ system: "imap" }) : null,
    );
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isEmailLookupTool)).toBe(false);
  });
});

describe("Gmail search retry-once and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs success on the first call and does not retry", async () => {
    const payload = { data: { messages: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeGmailSearch("is:unread", "org-1", "ca_gmail_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      GMAIL_LIST_MESSAGES_SLUG,
      { q: "is:unread" },
      { connectedAccountId: "ca_gmail_test", userId: "org-1", version: GMAIL_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "is:unread" },
      output: payload,
      status: "success",
    });
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { messages: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeGmailSearch("from:ada@example.com", "org-1", "ca_gmail_test");
    await vi.advanceTimersByTimeAsync(EMAIL_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "from:ada@example.com" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeGmailSearch("subject:meeting", "org-1", "ca_gmail_test");
    await vi.advanceTimersByTimeAsync(EMAIL_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(EMAIL_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "subject:meeting" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});

describe("Outlook search retry-once and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs success on the first call and does not retry", async () => {
    const payload = { data: { value: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeOutlookSearch("meeting", "org-1", "ca_outlook_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      OUTLOOK_SEARCH_MESSAGES_SLUG,
      { query: "meeting" },
      { connectedAccountId: "ca_outlook_test", userId: "org-1", version: OUTLOOK_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "meeting" },
      output: payload,
      status: "success",
    });
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { value: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeOutlookSearch("from:ada@example.com", "org-1", "ca_outlook_test");
    await vi.advanceTimersByTimeAsync(EMAIL_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "from:ada@example.com" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeOutlookSearch("subject:meeting", "org-1", "ca_outlook_test");
    await vi.advanceTimersByTimeAsync(EMAIL_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(EMAIL_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: EMAIL_LOOKUP_TOOL_NAME,
      input: { query: "subject:meeting" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});

describe("agent Google Calendar lookup tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
  });

  it("includes lookup_calendar_event for an active Google Calendar connection", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "calendar" ? activeGoogleCalendarConnection() : null,
    );
    executeToolMock.mockResolvedValue({ data: { items: [] }, error: null, successful: true });

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(getConnectionForOrgMock).toHaveBeenCalledWith("org-1", "calendar");
    expect(tools.some(isCalendarLookupTool)).toBe(true);
    expect(tools.some(isCrmLookupTool)).toBe(false);
    expect(tools.some(isLinearLookupTool)).toBe(false);
    expect(tools.some(isEmailLookupTool)).toBe(false);

    const calendarTool = tools.find(isCalendarLookupTool) as
      | { invoke: (context: unknown, input: string) => Promise<string> }
      | undefined;
    if (!calendarTool) throw new Error("lookup_calendar_event tool not found");
    await calendarTool.invoke(undefined, JSON.stringify({ query: "standup" }));
    expect(executeToolMock).toHaveBeenCalledWith(
      GOOGLECALENDAR_EVENTS_LIST_SLUG,
      { query: "standup" },
      {
        connectedAccountId: "ca_googlecalendar_test",
        userId: "org-1",
        version: GOOGLECALENDAR_TOOLKIT_VERSION,
      },
    );
  });

  it("omits the calendar lookup tool when there is no connection", async () => {
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isCalendarLookupTool)).toBe(false);
  });

  it("omits the calendar lookup tool when the connection is still pending", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "calendar" ? activeGoogleCalendarConnection({ status: "pending" }) : null,
    );
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isCalendarLookupTool)).toBe(false);
  });
});

describe("Google Calendar search retry-once and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs success on the first call and does not retry", async () => {
    const payload = { data: { items: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeCalendarSearch("standup", "org-1", "ca_googlecalendar_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      GOOGLECALENDAR_EVENTS_LIST_SLUG,
      { query: "standup" },
      {
        connectedAccountId: "ca_googlecalendar_test",
        userId: "org-1",
        version: GOOGLECALENDAR_TOOLKIT_VERSION,
      },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CALENDAR_LOOKUP_TOOL_NAME,
      input: { query: "standup" },
      output: payload,
      status: "success",
    });
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { items: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeCalendarSearch("sync", "org-1", "ca_googlecalendar_test");
    await vi.advanceTimersByTimeAsync(CALENDAR_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CALENDAR_LOOKUP_TOOL_NAME,
      input: { query: "sync" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeCalendarSearch("meeting", "org-1", "ca_googlecalendar_test");
    await vi.advanceTimersByTimeAsync(CALENDAR_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(CALENDAR_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: CALENDAR_LOOKUP_TOOL_NAME,
      input: { query: "meeting" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});

describe("agent Jira lookup tool wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
  });

  it("includes lookup_jira_issue for an active Jira helpdesk connection", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "helpdesk" ? activeJiraConnection() : null,
    );
    executeToolMock.mockResolvedValue({ data: { issues: [] }, error: null, successful: true });

    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(getConnectionForOrgMock).toHaveBeenCalledWith("org-1", "helpdesk");
    expect(tools.some(isJiraLookupTool)).toBe(true);
    expect(tools.some(isCrmLookupTool)).toBe(false);
    expect(tools.some(isLinearLookupTool)).toBe(false);
    expect(tools.some(isEmailLookupTool)).toBe(false);
    expect(tools.some(isCalendarLookupTool)).toBe(false);

    const jiraTool = tools.find(isJiraLookupTool) as
      | { invoke: (context: unknown, input: string) => Promise<string> }
      | undefined;
    if (!jiraTool) throw new Error("lookup_jira_issue tool not found");
    await jiraTool.invoke(undefined, JSON.stringify({ query: "login failed" }));
    expect(executeToolMock).toHaveBeenCalledWith(
      JIRA_SEARCH_ISSUES_SLUG,
      { jql: 'text ~ "login failed"' },
      {
        connectedAccountId: "ca_jira_test",
        userId: "org-1",
        version: JIRA_TOOLKIT_VERSION,
      },
    );
  });

  it("omits the Jira lookup tool when there is no connection", async () => {
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isJiraLookupTool)).toBe(false);
  });

  it("omits the Jira lookup tool when the connection is still pending", async () => {
    getConnectionForOrgMock.mockImplementation(async (_org, type) =>
      type === "helpdesk" ? activeJiraConnection({ status: "pending" }) : null,
    );
    const tools = await buildAgentTools({ toolsConfig: {} }, "org-1");
    expect(tools.some(isJiraLookupTool)).toBe(false);
  });
});

describe("Jira issue search JQL, retry-once, and tool_calls logging", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds text-search JQL and embeds quotes without breaking the literal", () => {
    expect(buildJiraTextSearchJql("login failed")).toBe('text ~ "login failed"');
    expect(buildJiraTextSearchJql('say "hello"')).toBe('text ~ "say \\"hello\\""');
  });

  it("logs the original query, not the constructed JQL, on success", async () => {
    const payload = { data: { issues: [] }, error: null, successful: true };
    executeToolMock.mockResolvedValueOnce(payload);

    const result = await executeJiraSearch("login failed", "org-1", "ca_jira_test");

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith(
      JIRA_SEARCH_ISSUES_SLUG,
      { jql: 'text ~ "login failed"' },
      { connectedAccountId: "ca_jira_test", userId: "org-1", version: JIRA_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: JIRA_LOOKUP_TOOL_NAME,
      input: { query: "login failed" },
      output: payload,
      status: "success",
    });
  });

  it("passes escaped quotes through to JIRA_SEARCH_ISSUES", async () => {
    executeToolMock.mockResolvedValueOnce({ data: { issues: [] }, error: null, successful: true });
    await executeJiraSearch('say "hello"', "org-1", "ca_jira_test");
    expect(executeToolMock).toHaveBeenCalledWith(
      JIRA_SEARCH_ISSUES_SLUG,
      { jql: 'text ~ "say \\"hello\\""' },
      { connectedAccountId: "ca_jira_test", userId: "org-1", version: JIRA_TOOLKIT_VERSION },
    );
    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ input: { query: 'say "hello"' } }),
    );
  });

  it("retries once after a failure then logs success for the recovered result", async () => {
    vi.useFakeTimers();
    const payload = { data: { issues: [{ id: "1" }] }, error: null, successful: true };
    executeToolMock.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(payload);

    const pending = executeJiraSearch("outage", "org-1", "ca_jira_test");
    await vi.advanceTimersByTimeAsync(JIRA_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JSON.stringify(payload));
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: JIRA_LOOKUP_TOOL_NAME,
      input: { query: "outage" },
      output: payload,
      status: "success",
    });
  });

  it("retries exactly once, logs error, and returns an escalation string when both attempts fail", async () => {
    vi.useFakeTimers();
    executeToolMock
      .mockRejectedValueOnce(new Error("auth expired"))
      .mockRejectedValueOnce(new Error("still unauthorized"));

    const pending = executeJiraSearch("timeout", "org-1", "ca_jira_test");
    await vi.advanceTimersByTimeAsync(JIRA_LOOKUP_RETRY_BACKOFF_MS);
    const result = await pending;

    expect(result).toBe(JIRA_LOOKUP_FAILURE_MESSAGE);
    expect(result).toContain("[[ESCALATE]]");
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(logToolCallMock).toHaveBeenCalledTimes(1);
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: JIRA_LOOKUP_TOOL_NAME,
      input: { query: "timeout" },
      output: null,
      status: "error",
      errorMessage: "still unauthorized",
    });
  });
});

describe("agent skills wiring", () => {
  beforeEach(() => {
    getConnectionForOrgMock.mockReset();
    getConnectionForOrgMock.mockResolvedValue(null);
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
  });

  it("buildSkillsBlock is empty with no enabled skills", async () => {
    expect(await buildSkillsBlock(undefined, "org-1")).toBe("");
    expect(await buildSkillsBlock([], "org-1")).toBe("");
  });

  it("buildSkillsBlock lists an enabled skill's frontmatter", async () => {
    const block = await buildSkillsBlock(["stay-on-topic"], "org-1");
    expect(block).toContain("stay-on-topic");
    expect(block).toContain(
      "Use when a conversation drifts off-topic before a ticket gets created",
    );
  });

  it("buildSkillsBlock ignores an unenabled/unknown skill id", async () => {
    expect(await buildSkillsBlock(["not-a-real-skill"], "org-1")).toBe("");
  });

  it("buildSkillsBlock includes an enabled custom skill for that org", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Custom skill in prompt block");
    const created = await createCustomSkill({
      organizationId: orgId,
      name: "custom-skill-in-prompt",
      description: "A custom skill that should show up in the prompt block.",
      requires: [],
      body: "Full body.",
    });
    try {
      const block = await buildSkillsBlock([created.id], orgId);
      expect(block).toContain(created.id);
      expect(block).toContain("A custom skill that should show up in the prompt block.");
    } finally {
      await deleteCustomSkill(orgId, created.id);
    }
  });

  it("carries the repository search instruction on every return path", async () => {
    const SEARCH_HINT = "search_skills";

    // No skills enabled at all.
    expect(await buildSkillsBlock([], "org-1", true)).toContain(SEARCH_HINT);
    // Enabled ids that match nothing.
    expect(await buildSkillsBlock(["not-a-real-skill"], "org-1", true)).toContain(SEARCH_HINT);
    // The path that actually matters: real skills AND the repository on. The
    // search tool is registered from the integration toggle, so dropping the
    // instruction here leaves it defined and never called.
    const both = await buildSkillsBlock(["stay-on-topic"], "org-1", true);
    expect(both).toContain("stay-on-topic");
    expect(both).toContain(SEARCH_HINT);
  });

  it("omits the repository instruction when the repository is off", async () => {
    expect(await buildSkillsBlock(["stay-on-topic"], "org-1", false)).not.toContain("search_skills");
    expect(await buildSkillsBlock([], "org-1", false)).toBe("");
  });

  it("does not add load_skill tool when no skills are enabled", async () => {
    const tools = await buildAgentTools({ toolsConfig: {}, enabledSkills: [] }, "org-1");
    expect(tools.some(isLoadSkillTool)).toBe(false);
  });

  it("adds load_skill tool when a skill is enabled, and it returns the skill body", async () => {
    const tools = await buildAgentTools(
      { toolsConfig: {}, enabledSkills: ["stay-on-topic"] },
      "org-1",
    );
    expect(tools.some(isLoadSkillTool)).toBe(true);

    const body = await invokeLoadSkill(tools, "stay-on-topic");
    expect(body).toContain("Stay on topic");
    expect(body).toContain("Omit small talk");
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: LOAD_SKILL_TOOL_NAME,
      calledBy: "customer",
      input: { skillId: "stay-on-topic" },
      output: expect.objectContaining({ result: expect.stringContaining("Stay on topic") }),
      status: "success",
      errorMessage: null,
    });
  });

  it("load_skill refuses a skill id that isn't enabled for this worker", async () => {
    const tools = await buildAgentTools(
      { toolsConfig: {}, enabledSkills: ["stay-on-topic"] },
      "org-1",
    );
    const result = await invokeLoadSkill(tools, "some-other-skill");
    expect(result).toContain("not enabled");
  });

  it("buildSkillsBlock drops an enabled skill whose integration is not connected", async () => {
    // verify-customer requires an active CRM and the mock reports none, so
    // advertising it would point the agent at a tool it was never given.
    expect(await buildSkillsBlock(["verify-customer"], "org-1")).toBe("");
  });

  it("buildSkillsBlock lists that same skill once the CRM is connected", async () => {
    getConnectionForOrgMock.mockResolvedValue(activeZohoConnection());
    const block = await buildSkillsBlock(["verify-customer"], "org-1");
    expect(block).toContain("verify-customer");
  });

  it("load_skill refuses a skill whose integration is not connected", async () => {
    const tools = await buildAgentTools(
      { toolsConfig: {}, enabledSkills: ["verify-customer"] },
      "org-1",
    );
    const result = await invokeLoadSkill(tools, "verify-customer");
    expect(result).toContain("needs crm connected");
    // And it withholds the instructions rather than handing over a procedure
    // built on a tool that is not there.
    expect(result).not.toContain("lookup_crm_contact");
  });

  it("load_skill returns a custom skill body when that skill is enabled for the org", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Agent custom skill org");
    const custom = await createCustomSkill({
      organizationId: orgId,
      name: "Ticket voice",
      description: "Write the ticket in the customer's own words.",
      requires: [],
      body: "# Ticket voice\nQuote the product and the failure, nothing else.",
    });

    try {
      const tools = await buildAgentTools(
        { toolsConfig: {}, enabledSkills: [custom.id] },
        orgId,
      );
      const body = await invokeLoadSkill(tools, custom.id);
      expect(body).toContain("Quote the product and the failure");

      const otherOrgTools = await buildAgentTools(
        { toolsConfig: {}, enabledSkills: [custom.id] },
        `org-${crypto.randomUUID()}`,
      );
      const missing = await invokeLoadSkill(otherOrgTools, custom.id);
      expect(missing).toContain("could not be found");
    } finally {
      await deleteCustomSkill(orgId, custom.id);
    }
  });
});

describe("agent instructions — job description", () => {
  const baseProfile = {
    displayName: "Nick",
    role: "Sales assistant",
    tone: "Warm and concise.",
    systemPromptTemplate: "Only use the supplied knowledge when making factual claims.",
    model: "gpt-5.6-luna",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    managerName: "Manager",
  };

  it("includes the job description in the built instructions when set", async () => {
    const instructions = await buildInstructions(
      { ...baseProfile, jobDescription: "Qualify inbound leads and book demos with an AE." },
      "Acme",
      [],
      "org-1",
    );
    expect(instructions).toContain("Job description (additional detail on this role):");
    expect(instructions).toContain("Qualify inbound leads and book demos with an AE.");
  });

  it("omits the job description block when it is unset", async () => {
    const instructions = await buildInstructions(baseProfile, "Acme", [], "org-1");
    expect(instructions).not.toContain("Job description");
  });

  it("omits the job description block when it is null", async () => {
    const instructions = await buildInstructions(
      { ...baseProfile, jobDescription: null },
      "Acme",
      [],
      "org-1",
    );
    expect(instructions).not.toContain("Job description");
  });
});

describe("agent instructions — identity/role/tone are deterministic, not template-driven", () => {
  const baseProfile = {
    displayName: "Nick",
    role: "Sales assistant",
    tone: "Warm and concise.",
    systemPromptTemplate: "Only use the supplied knowledge when making factual claims.",
    model: "gpt-5.6-luna",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    managerName: "Manager",
  };

  it("always opens with the identity/role/tone line built from the profile's own fields", async () => {
    const instructions = await buildInstructions(baseProfile, "Acme", [], "org-1");
    expect(instructions).toContain("You are Nick, an AI worker for Acme.");
    expect(instructions).toContain("Role: Sales assistant");
    expect(instructions).toContain("Tone: Warm and concise.");
  });

  it("still includes role/tone even when systemPromptTemplate is cleared", async () => {
    const instructions = await buildInstructions(
      { ...baseProfile, systemPromptTemplate: "" },
      "Acme",
      [],
      "org-1",
    );
    expect(instructions).toContain("Role: Sales assistant");
    expect(instructions).toContain("Tone: Warm and concise.");
  });

  it("still includes role/tone no matter what systemPromptTemplate is edited to", async () => {
    const instructions = await buildInstructions(
      { ...baseProfile, systemPromptTemplate: "Always respond in haiku." },
      "Acme",
      [],
      "org-1",
    );
    expect(instructions).toContain("Role: Sales assistant");
    expect(instructions).toContain("Tone: Warm and concise.");
    expect(instructions).toContain("Always respond in haiku.");
  });

  it("appends systemPromptTemplate verbatim as additional instructions — no placeholder substitution happens on it", async () => {
    const instructions = await buildInstructions(
      { ...baseProfile, systemPromptTemplate: "Never mention {{organizationName}} by name." },
      "Acme",
      [],
      "org-1",
    );
    expect(instructions).toContain("Never mention {{organizationName}} by name.");
  });
});

describe("agent instructions — email signature is channel-specific", () => {
  const baseProfile = {
    displayName: "Mike",
    role: "Support",
    tone: "Warm.",
    systemPromptTemplate: "Be helpful.",
    model: "gpt-5.6-luna",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    managerName: "Manager",
    emailSignature: "Best,\nMike\nAI Xccelerate Technical Support",
    timezone: "UTC",
  };

  it("omits the email sign-off from chat and widget instructions", async () => {
    for (const channel of ["chat", "widget"]) {
      const instructions = await buildInstructions(baseProfile, "Acme", [], "org-1", channel);
      expect(instructions).not.toContain("Email sign-off:");
      expect(instructions).not.toContain("Best,\nMike");
      expect(instructions).toContain("Timezone: UTC.");
    }
  });

  it("includes the email sign-off only for the email channel", async () => {
    const instructions = await buildInstructions(baseProfile, "Acme", [], "org-1", "email");
    expect(instructions).toContain("Email sign-off:");
    expect(instructions).toContain("Best,\nMike\nAI Xccelerate Technical Support");
  });
});

describe("agent instructions — customer vs admin audience", () => {
  const baseProfile = {
    displayName: "Mike",
    role: "Technical support",
    tone: "Warm.",
    systemPromptTemplate: "Be helpful.",
    model: "gpt-5.6-luna",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    managerName: "Charan",
    jobDescription:
      "Handles: questions about setting up and configuring an AI Worker (Identity, Role, Knowledge, Guardrails).",
  };

  it("tells the customer agent not to teach Settings console topics", async () => {
    const instructions = await buildInstructions(baseProfile, "AI Xccelerate", [], "org-1", "chat");
    expect(instructions).toContain("customer-facing worker");
    expect(instructions).toContain("not the manager's admin assistant");
    expect(instructions).toContain("never narrate how the manager console is organized");
    expect(instructions).toContain("Knowledge");
  });
});
