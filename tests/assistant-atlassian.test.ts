import { beforeEach, describe, expect, it, vi } from "vitest";
import type { workerProfiles } from "@/db/schema";

// Same chainable drizzle stand-in as assistant-approvals.test.ts: awaiting any
// query yields `rows`.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/db", () => {
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(dbState.rows) : chain),
      apply: () => chain(),
    });
  return { db: { select: () => chain(), update: () => chain(), insert: () => chain(), delete: () => chain() } };
});

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));
vi.mock("@/lib/tools-integrations/connection-repository", () => ({ getConnectionForOrg: vi.fn() }));
vi.mock("@/lib/tools-integrations/composio-client", () => ({
  executeTool: vi.fn(),
  getActionSchema: vi.fn(),
  searchActions: vi.fn(),
}));
vi.mock("@/lib/tools-integrations/approval-repository", () => ({
  createPendingApproval: vi.fn(),
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  recordApprovalResult: vi.fn(),
  retirePendingApprovals: vi.fn(),
}));

import {
  buildAssistantTools,
  CONFIRM_PENDING_CHANGE_TOOL_NAME,
  PROPOSE_ACTION_TOOL_NAME,
  PROPOSE_INTEGRATION_ACTION_TOOL_NAME,
} from "@/lib/assistant-agent";
import {
  JIRA_SEARCH_ISSUES_SLUG,
  MANAGER_JIRA_SEARCH_TOOL_NAME,
} from "@/lib/tools-integrations/atlassian";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { executeTool, getActionSchema } from "@/lib/tools-integrations/composio-client";
import {
  createPendingApproval,
  decideApproval,
  listPendingApprovals,
  type ToolApproval,
} from "@/lib/tools-integrations/approval-repository";

type Profile = typeof workerProfiles.$inferSelect;

const getConnectionMock = vi.mocked(getConnectionForOrg);
const executeToolMock = vi.mocked(executeTool);
const getActionSchemaMock = vi.mocked(getActionSchema);
const createMock = vi.mocked(createPendingApproval);
const listMock = vi.mocked(listPendingApprovals);
const decideMock = vi.mocked(decideApproval);

function profile(overrides: Partial<Profile> = {}): Profile {
  return { displayName: "Mike", managerName: "Charan", assistantActionsEnabled: true, model: "gpt-5.6-luna", ...overrides } as Profile;
}

function approval(id: string, toolId: string, input: Record<string, unknown>): ToolApproval {
  return {
    id,
    organizationId: "org-1",
    conversationId: "conv-1",
    toolId,
    input,
    status: "pending",
    result: null,
    errorMessage: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function jira(): IntegrationConnection {
  return {
    id: "c-1",
    organizationId: "org-1",
    integrationType: "helpdesk",
    system: "jira",
    composioAuthConfigId: "ac_jira",
    composioConnectedAccountId: "ca_jira",
    status: "active",
    connectedBy: null,
    metadata: { settings: { projectKey: "SUP", issueType: "Task", createTicketOnHandoff: true } },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
  };
}

const createIssueSchema = {
  slug: "JIRA_CREATE_ISSUE",
  name: "Create issue",
  toolkit: "jira",
  version: "20260915_00",
  tags: [],
  isDeprecated: false,
  inputParameters: { required: ["project_key", "summary", "issue_type"] },
};

function names(tools: unknown[]): string[] {
  return tools.map((t) => (t as { name?: string }).name ?? "");
}

async function invoke(tools: unknown[], name: string, input: Record<string, unknown>): Promise<string> {
  const found = tools.find((t) => (t as { name?: string }).name === name) as
    | { invoke: (ctx: unknown, raw: string) => Promise<string> }
    | undefined;
  if (!found) throw new Error(`${name} not found`);
  return found.invoke(undefined, JSON.stringify(input));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [];
  getConnectionMock.mockImplementation(async (_org, type) => (type === "helpdesk" ? jira() : null));
  let n = 0;
  createMock.mockImplementation(async (entry) => approval(`new-${++n}`, entry.toolId, entry.input));
  listMock.mockResolvedValue([]);
  decideMock.mockImplementation(async (id) => approval(id, "x", {}));
});

describe("the Assistant reading Jira", () => {
  it("searches the handoff project by default, read-only members included", async () => {
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { issues: [] } });
    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { readOnly: true });

    await invoke(tools, MANAGER_JIRA_SEARCH_TOOL_NAME, { query: "invoice", projectKey: null });

    expect(executeToolMock).toHaveBeenCalledWith(
      JIRA_SEARCH_ISSUES_SLUG,
      expect.objectContaining({ jql: 'project = "SUP" AND text ~ "invoice" ORDER BY updated DESC' }),
      expect.objectContaining({ connectedAccountId: "ca_jira" }),
    );
  });

  it("says so when Jira isn't connected", async () => {
    getConnectionMock.mockResolvedValue(null);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(await invoke(tools, MANAGER_JIRA_SEARCH_TOOL_NAME, { query: "", projectKey: null })).toContain(
      "Jira isn't connected",
    );
    expect(executeToolMock).not.toHaveBeenCalled();
  });
});

describe("the Assistant changing things in Jira", () => {
  it("only offers it when Assistant actions are on, and never to read-only members", () => {
    expect(names(buildAssistantTools(profile(), "org-1", "conv-1"))).toContain(PROPOSE_INTEGRATION_ACTION_TOOL_NAME);
    const off = names(buildAssistantTools(profile({ assistantActionsEnabled: false }), "org-1", "conv-1"));
    expect(off).not.toContain(PROPOSE_INTEGRATION_ACTION_TOOL_NAME);
    expect(off).toContain(PROPOSE_ACTION_TOOL_NAME);
    expect(names(buildAssistantTools(profile(), "org-1", "conv-1", { readOnly: true }))).not.toContain(
      PROPOSE_INTEGRATION_ACTION_TOOL_NAME,
    );
  });

  it("proposes creating a ticket without running anything", async () => {
    getActionSchemaMock.mockResolvedValue(createIssueSchema);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");

    await invoke(tools, PROPOSE_INTEGRATION_ACTION_TOOL_NAME, {
      action: "JIRA_CREATE_ISSUE",
      arguments_json: JSON.stringify({ project_key: "SUP", issue_type: "Task", summary: "Invoice shows wrong amount" }),
      summary: "create a Jira task in SUP: Invoice shows wrong amount",
      reason: "The manager asked",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "assistant_action_integration",
        input: expect.objectContaining({
          action: "JIRA_CREATE_ISSUE",
          app: "jira",
          version: "20260915_00",
          arguments: { project_key: "SUP", issue_type: "Task", summary: "Invoice shows wrong amount" },
        }),
      }),
    );
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("refuses a proposal missing what the action needs", async () => {
    getActionSchemaMock.mockResolvedValue(createIssueSchema);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_INTEGRATION_ACTION_TOOL_NAME, {
      action: "JIRA_CREATE_ISSUE",
      arguments_json: JSON.stringify({ project_key: "SUP" }),
      summary: "create a ticket",
      reason: "asked",
    });
    expect(out).toContain("also needs summary, issue_type");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("runs it once the manager says yes, and reports the new key", async () => {
    listMock.mockResolvedValue([
      approval("a", "assistant_action_integration", {
        action: "JIRA_CREATE_ISSUE",
        app: "jira",
        version: "20260915_00",
        tier: "routine",
        arguments: { project_key: "SUP", issue_type: "Task", summary: "Invoice shows wrong amount" },
        summary: "create a Jira task in SUP: Invoice shows wrong amount",
      }),
    ]);
    dbState.rows = [{ organizationId: "org-1", assistantActionsEnabled: true }];
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-14" } });

    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { priorPendingIds: ["a"], managerMessage: "yes, go ahead" });
    const out = await invoke(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});

    expect(executeToolMock).toHaveBeenCalledWith(
      "JIRA_CREATE_ISSUE",
      { project_key: "SUP", issue_type: "Task", summary: "Invoice shows wrong amount" },
      expect.objectContaining({ connectedAccountId: "ca_jira", version: "20260915_00" }),
    );
    expect(out).toContain("That went through in Jira as SUP-14.");
  });
});
