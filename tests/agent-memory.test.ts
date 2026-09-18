import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runTracedAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent-tracing", () => ({
  CUSTOMER_CHAT_WORKFLOW: "Customer chat",
  runTracedAgent: runTracedAgentMock,
}));

vi.mock("@/lib/tools-integrations/connection-repository", () => ({
  getConnectionForOrg: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/tools-integrations/skills-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/skills-catalog")>();
  return {
    ...actual,
    listActiveSkillsForOrg: vi.fn().mockResolvedValue([]),
    getSkillForOrg: vi.fn().mockResolvedValue(null),
    skillRequirementsMet: vi.fn().mockReturnValue(true),
  };
});

import { runAgent } from "@/lib/agent";

const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.DEMO_MODE = "false";
  process.env.OPENAI_API_KEY = "sk-test";
  runTracedAgentMock.mockReset();
  runTracedAgentMock.mockResolvedValue({ finalOutput: "[[FOLLOWUP]] Got it — try Resend again." });
});

afterEach(() => {
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

describe("runAgent conversation memory", () => {
  it("sends prior turns and the current message as one input string", async () => {
    const result = await runAgent(
      {
        displayName: "Mike",
        role: "Support",
        tone: "Warm",
        systemPromptTemplate: "Be helpful.",
        model: "gpt-test",
        maxAgentTurns: 3,
        confidenceThreshold: 0.72,
        managerName: "Charan",
        toolsConfig: {},
        enabledSkills: [],
      },
      "AI Xccelerate",
      "Still nothing",
      [],
      "default",
      "conv-1",
      [
        { speaker: "Customer", body: "My sign-in code never arrived" },
        { speaker: "Mike", body: "Check spam, then tap Resend." },
      ],
      null,
      "Customer",
    );

    expect(result.answer).toContain("Resend");
    expect(runTracedAgentMock).toHaveBeenCalledOnce();
    const input = runTracedAgentMock.mock.calls[0]?.[3] as string;
    expect(input).toContain("Earlier in this conversation:");
    expect(input).toContain("Customer: My sign-in code never arrived");
    expect(input).toContain("Mike: Check spam, then tap Resend.");
    expect(input).toContain("Customer: Still nothing");
    const options = runTracedAgentMock.mock.calls[0]?.[4] as {
      context: {
        escalationTerms: string[];
        confidenceThreshold: number;
        recentHistory: { speaker: string; body: string }[];
      };
    };
    expect(options.context.confidenceThreshold).toBe(0.72);
    expect(options.context.recentHistory).toHaveLength(2);
  });
});
