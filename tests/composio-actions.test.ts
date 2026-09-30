import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/tools-integrations/connection-repository", () => ({
  getConnectionForOrg: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/composio-client", () => ({
  executeTool: vi.fn(),
  getActionSchema: vi.fn(),
  searchActions: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({
  logToolCall: vi.fn(),
}));

import { db } from "@/lib/db";
import { conversations, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { executeTool, getActionSchema, searchActions, type ComposioActionSchema } from "@/lib/tools-integrations/composio-client";
import { listPendingApprovals } from "@/lib/tools-integrations/approval-repository";
import {
  applyComposioActionApproval,
  COMPOSIO_ACTION_APPROVAL_TOOL_ID,
  executeRunAction,
  executeSearchActions,
} from "@/lib/tools-integrations/composio-actions";

const connectionMock = vi.mocked(getConnectionForOrg);
const executeMock = vi.mocked(executeTool);
const schemaMock = vi.mocked(getActionSchema);
const searchMock = vi.mocked(searchActions);

let orgId: string;

function connection(type: string, system: string, accountId: string) {
  return {
    id: `${system}-conn`,
    organizationId: orgId,
    integrationType: type,
    system,
    status: "active",
    composioConnectedAccountId: accountId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Awaited<ReturnType<typeof getConnectionForOrg>>;
}

function schema(slug: string, toolkit: string, extra: Partial<ComposioActionSchema> = {}): ComposioActionSchema {
  return { slug, name: slug, toolkit, version: "20260915_00", tags: [], isDeprecated: false, ...extra };
}

async function run(action: string, args: Record<string, unknown>, requireWriteApproval: boolean, conversationId?: string) {
  return executeRunAction(
    { action, argumentsJson: JSON.stringify(args) },
    { organizationId: orgId, conversationId: conversationId ?? null, requireWriteApproval },
  );
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Composio actions test");
  connectionMock.mockReset();
  connectionMock.mockImplementation(async (_org, type) => {
    if (type === "helpdesk") return connection("helpdesk", "jira", "ca_jira");
    if (type === "email") return connection("email", "gmail", "ca_gmail");
    return null;
  });
  executeMock.mockReset();
  executeMock.mockResolvedValue({ data: { ok: true }, error: null, successful: true } as never);
  schemaMock.mockReset();
  searchMock.mockReset();
});

afterEach(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("search_integration_actions", () => {
  it("searches only connected apps and says which actions need approval", async () => {
    searchMock.mockResolvedValue([
      schema("JIRA_ADD_COMMENT", "jira", { description: "Add a comment", inputParameters: { properties: { issue_key: { type: "string" } }, required: ["issue_key"] } }),
      schema("JIRA_DELETE_ISSUE", "jira"),
      schema("JIRA_OLD_THING", "jira", { isDeprecated: true }),
    ]);

    const out = JSON.parse(await executeSearchActions("comment", "jira", orgId)) as {
      actions: { action: string; approval: string; parameters: Record<string, string> }[];
    };

    expect(searchMock).toHaveBeenCalledWith(["jira"], "comment", 8);
    expect(out.actions.map((a) => a.action)).toEqual(["JIRA_ADD_COMMENT", "JIRA_DELETE_ISSUE"]);
    expect(out.actions[0].parameters.issue_key).toContain("(required)");
    expect(out.actions[1].approval).toBe("a manager approves first");
  });

  it("refuses an app that isn't connected", async () => {
    expect(await executeSearchActions("x", "linear", orgId)).toContain("isn't connected");
    expect(searchMock).not.toHaveBeenCalled();
  });
});

describe("run_integration_action", () => {
  it("runs a read straight away, with the connected account and the action's version", async () => {
    schemaMock.mockResolvedValue(schema("JIRA_GET_ISSUE", "jira"));
    const out = await run("JIRA_GET_ISSUE", { issue_key: "AIX-1" }, true);
    expect(out).toContain("ok");
    expect(executeMock).toHaveBeenCalledWith("JIRA_GET_ISSUE", { issue_key: "AIX-1" }, {
      connectedAccountId: "ca_jira",
      userId: orgId,
      version: "20260915_00",
    });
  });

  it("queues a routine change while every change needs approval, and runs it once that's off", async () => {
    schemaMock.mockResolvedValue(schema("JIRA_ADD_COMMENT", "jira"));

    const queued = await run("JIRA_ADD_COMMENT", { issue_key: "AIX-1", comment: "Fixed" }, true);
    expect(queued).toContain("Queued for manager approval");
    expect(executeMock).not.toHaveBeenCalled();
    const [pending] = await listPendingApprovals(orgId, null);
    expect(pending).toMatchObject({
      toolId: COMPOSIO_ACTION_APPROVAL_TOOL_ID,
      input: { action: "JIRA_ADD_COMMENT", app: "jira", tier: "routine", arguments: { issue_key: "AIX-1", comment: "Fixed" } },
    });

    await run("JIRA_ADD_COMMENT", { issue_key: "AIX-1", comment: "Fixed" }, false);
    expect(executeMock).toHaveBeenCalledOnce();
  });

  it("always queues deletes, even with approval off", async () => {
    schemaMock.mockResolvedValue(schema("JIRA_DELETE_ISSUE", "jira"));
    expect(await run("JIRA_DELETE_ISSUE", { issue_key: "AIX-1" }, false)).toContain("Deleting always needs");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("emails the conversation's own customer straight away, and queues anyone else", async () => {
    const [conversation] = await db
      .insert(conversations)
      .values({ organizationId: orgId, ticketNumber: 1001, channel: "email", customerEmail: "cust@example.com" })
      .returning();
    schemaMock.mockResolvedValue(schema("GMAIL_SEND_EMAIL", "gmail"));

    await run("GMAIL_SEND_EMAIL", { recipient_email: "cust@example.com", body: "Hi" }, false, conversation.id);
    expect(executeMock).toHaveBeenCalledOnce();

    const out = await run("GMAIL_SEND_EMAIL", { recipient_email: "stranger@example.org", body: "Hi" }, false, conversation.id);
    expect(out).toContain("Queued for manager approval");
    expect(executeMock).toHaveBeenCalledOnce();
  });

  it("refuses an action from an app that isn't connected, and bad arguments", async () => {
    schemaMock.mockResolvedValue(schema("LINEAR_CREATE_LINEAR_ISSUE", "linear"));
    expect(await run("LINEAR_CREATE_LINEAR_ISSUE", {}, false)).toContain("isn't connected");

    const bad = await executeRunAction(
      { action: "JIRA_GET_ISSUE", argumentsJson: "[1,2]" },
      { organizationId: orgId, requireWriteApproval: false },
    );
    expect(bad).toContain("must be a JSON object");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("doesn't claim success when the action fails", async () => {
    schemaMock.mockResolvedValue(schema("JIRA_CREATE_ISSUE", "jira"));
    executeMock.mockRejectedValue(new Error("403 from Jira"));
    expect(await run("JIRA_CREATE_ISSUE", { summary: "x" }, false)).toContain("didn't go through");
  });
});

describe("applyComposioActionApproval", () => {
  const queued = { action: "JIRA_DELETE_ISSUE", app: "jira", version: "20260915_00", tier: "delete", arguments: { issue_key: "AIX-1" } };

  it("runs the approved action against the app's current connection", async () => {
    const applied = await applyComposioActionApproval(queued, orgId, "manager-1");
    expect(applied.ok).toBe(true);
    expect(executeMock).toHaveBeenCalledWith("JIRA_DELETE_ISSUE", { issue_key: "AIX-1" }, {
      connectedAccountId: "ca_jira",
      userId: orgId,
      version: "20260915_00",
    });
  });

  it("fails cleanly when the app was disconnected after the agent asked", async () => {
    connectionMock.mockResolvedValue(null);
    const applied = await applyComposioActionApproval(queued, orgId, "manager-1");
    expect(applied.ok).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
