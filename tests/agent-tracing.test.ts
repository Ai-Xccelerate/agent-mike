import { describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_CHAT_WORKFLOW,
  CUSTOMER_CHAT_WORKFLOW,
  agentTraceRunConfig,
} from "@/lib/agent-tracing";
import { logAndRunTool, toolLogOutput } from "@/lib/tools-integrations/logged-tool";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({
  logToolCall: vi.fn(),
}));

const logToolCallMock = vi.mocked(logToolCall);

describe("agentTraceRunConfig", () => {
  it("names the customer workflow and tags org plus conversation", () => {
    expect(
      agentTraceRunConfig(CUSTOMER_CHAT_WORKFLOW, {
        organizationId: "org-1",
        conversationId: "conv-9",
      }),
    ).toEqual({
      workflowName: "Customer chat",
      groupId: "conv-9",
      traceMetadata: {
        organizationId: "org-1",
        conversationId: "conv-9",
      },
    });
  });

  it("omits conversation metadata when the thread is not known yet", () => {
    expect(agentTraceRunConfig(ASSISTANT_CHAT_WORKFLOW, { organizationId: "org-1" })).toEqual({
      workflowName: "Assistant chat",
      groupId: undefined,
      traceMetadata: { organizationId: "org-1" },
    });
  });
});

describe("logAndRunTool", () => {
  it("records success output and returns the tool result", async () => {
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);

    const result = await logAndRunTool(
      { organizationId: "org-1", toolId: "load_skill", calledBy: "customer", input: { skillId: "stay-on-topic" } },
      async () => "skill body",
    );

    expect(result).toBe("skill body");
    expect(logToolCallMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      toolId: "load_skill",
      calledBy: "customer",
      input: { skillId: "stay-on-topic" },
      output: { result: "skill body" },
      status: "success",
      errorMessage: null,
    });
  });

  it("marks returned failure strings as error without throwing", async () => {
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);

    const result = await logAndRunTool(
      { organizationId: "org-1", toolId: "confirm_pending_change", calledBy: "assistant", input: {} },
      async () => "Could not complete that: no ticket",
      { errorIf: (text) => (text.startsWith("Could not") ? text : null) },
    );

    expect(result).toBe("Could not complete that: no ticket");
    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "Could not complete that: no ticket",
      }),
    );
  });

  it("logs thrown errors then rethrows", async () => {
    logToolCallMock.mockReset();
    logToolCallMock.mockResolvedValue(undefined);

    await expect(
      logAndRunTool(
        { organizationId: "org-1", toolId: "search_skills", calledBy: "customer", input: { task: "x" } },
        async () => {
          throw new Error("repository down");
        },
      ),
    ).rejects.toThrow("repository down");

    expect(logToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "repository down",
        output: null,
      }),
    );
  });
});

describe("toolLogOutput", () => {
  it("truncates long skill bodies so toolCalls rows stay bounded", () => {
    const long = "a".repeat(2000);
    const output = toolLogOutput(long);
    expect(String(output.result).length).toBeLessThan(long.length);
    expect(output.truncated).toBe(true);
    expect(output.length).toBe(2000);
  });
});
