import { beforeEach, describe, expect, it, vi } from "vitest";
import type { workerProfiles } from "@/db/schema";
import {
  buildAssistantTools,
  CANCEL_PENDING_CHANGE_TOOL_NAME,
  CONFIRM_PENDING_CHANGE_TOOL_NAME,
  PROPOSE_ACTION_TOOL_NAME,
  PROPOSE_ROLE_CHANGE_TOOL_NAME,
} from "@/lib/assistant-agent";
import { createPendingApproval, listPendingApprovals } from "@/lib/tools-integrations/approval-repository";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({
  logToolCall: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/approval-repository", () => ({
  createPendingApproval: vi.fn(),
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  recordApprovalResult: vi.fn(),
}));

const logToolCallMock = vi.mocked(logToolCall);
const createPendingApprovalMock = vi.mocked(createPendingApproval);
const listPendingApprovalsMock = vi.mocked(listPendingApprovals);

type Profile = typeof workerProfiles.$inferSelect;

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: "Mike",
    managerName: "Charan",
    assistantActionsEnabled: false,
    ...overrides,
  } as Profile;
}

function isNamedTool(tool: unknown, name: string): boolean {
  return Boolean(tool && typeof tool === "object" && (tool as { name?: string }).name === name);
}

async function invokeTool(tools: unknown[], name: string, input: Record<string, unknown>): Promise<string> {
  const found = tools.find((tool) => isNamedTool(tool, name)) as
    | { invoke: (context: unknown, raw: string) => Promise<string> }
    | undefined;
  if (!found) throw new Error(`${name} tool not found`);
  return found.invoke(undefined, JSON.stringify(input));
}

describe("assistant propose/confirm tool logging", () => {
  beforeEach(() => {
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);
    createPendingApprovalMock.mockReset();
    listPendingApprovalsMock.mockReset();
  });

  it("logs propose_role_change when the assistant records a pending change", async () => {
    createPendingApprovalMock.mockResolvedValue({ id: "appr-1" } as Awaited<ReturnType<typeof createPendingApproval>>);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");

    const result = await invokeTool(tools, PROPOSE_ROLE_CHANGE_TOOL_NAME, {
      newValue: "Triage only",
      reason: "demo",
    });

    expect(result).toContain("Proposed (id appr-1)");
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: PROPOSE_ROLE_CHANGE_TOOL_NAME,
      calledBy: "assistant",
      input: { newValue: "Triage only", reason: "demo" },
      output: expect.objectContaining({ result: expect.stringContaining("Proposed (id appr-1)") }),
      status: "success",
      errorMessage: null,
    });
  });

  it("logs confirm_pending_change when nothing is waiting", async () => {
    listPendingApprovalsMock.mockResolvedValue([]);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");

    const result = await invokeTool(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});
    expect(result).toContain("nothing pending");
    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: CONFIRM_PENDING_CHANGE_TOOL_NAME,
        calledBy: "assistant",
        status: "success",
      }),
    );
  });

  it("logs cancel_pending_change and the disabled propose_action stub", async () => {
    listPendingApprovalsMock.mockResolvedValue([]);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");

    await invokeTool(tools, CANCEL_PENDING_CHANGE_TOOL_NAME, {});
    await invokeTool(tools, PROPOSE_ACTION_TOOL_NAME, { actionType: "reply", details: "hi" });

    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: CANCEL_PENDING_CHANGE_TOOL_NAME, calledBy: "assistant" }),
    );
    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: PROPOSE_ACTION_TOOL_NAME,
        calledBy: "assistant",
        input: { actionType: "reply", details: "hi" },
      }),
    );
  });
});
