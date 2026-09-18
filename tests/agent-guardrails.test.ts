import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputGuardrailTripwireTriggered, OutputGuardrailTripwireTriggered } from "@openai/agents";

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

import { handoffToManager, runAgent } from "@/lib/agent";

const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;

const profile = {
  displayName: "Mike",
  role: "Support",
  tone: "Warm",
  systemPromptTemplate: "Be helpful.",
  model: "gpt-test",
  maxAgentTurns: 3,
  confidenceThreshold: 0.72,
  managerName: "Charan",
  escalationTerms: ["refund"],
  toolsConfig: {},
  enabledSkills: [] as string[],
};

beforeEach(() => {
  process.env.DEMO_MODE = "false";
  process.env.OPENAI_API_KEY = "sk-test";
  runTracedAgentMock.mockReset();
});

afterEach(() => {
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

describe("runAgent guardrail tripwires", () => {
  it("maps InputGuardrailTripwireTriggered to the manager handoff", async () => {
    runTracedAgentMock.mockRejectedValue(
      new InputGuardrailTripwireTriggered("tripped", {
        guardrail: { type: "input", name: "Customer intent guardrail" },
        output: {
          tripwireTriggered: true,
          outputInfo: { escalate: true, confidence: 0.1, reason: "billing" },
        },
      }),
    );

    const result = await runAgent(profile, "Acme", "I want my money back", [], "org-1");
    expect(result).toEqual(handoffToManager(profile));
  });

  it("maps OutputGuardrailTripwireTriggered to the manager handoff", async () => {
    runTracedAgentMock.mockRejectedValue(
      new OutputGuardrailTripwireTriggered("tripped", {
        guardrail: { type: "output", name: "Customer reply guardrail" },
        agent: {} as never,
        agentOutput: "leaked",
        output: {
          tripwireTriggered: true,
          outputInfo: { systemPromptLeak: true, reason: "leak" },
        },
      }),
    );

    const result = await runAgent(profile, "Acme", "hi", [], "org-1");
    expect(result.escalate).toBe(true);
    expect(result.answer).toContain("Charan");
  });

  it("uses classifier confidence from a successful input guardrail result", async () => {
    runTracedAgentMock.mockResolvedValue({
      finalOutput: "Reset from Settings. [[RESOLVE]]",
      inputGuardrailResults: [
        {
          guardrail: { type: "input", name: "Customer intent guardrail" },
          output: {
            tripwireTriggered: false,
            outputInfo: {
              injectionSuspected: false,
              escalate: false,
              matchedThemes: [],
              confidence: 0.86,
              reason: "routine how-to",
            },
          },
        },
      ],
    });

    const result = await runAgent(profile, "Acme", "How do I reset my password?", [], "org-1");
    expect(result.escalate).toBe(false);
    expect(result.confidence).toBe(0.86);
    expect(result.answer).toContain("Reset from Settings");
  });

  it("attaches input and output guardrails on the agent", async () => {
    runTracedAgentMock.mockResolvedValue({ finalOutput: "ok [[FOLLOWUP]]", inputGuardrailResults: [] });
    await runAgent(profile, "Acme", "hello", [], "org-1");
    const agent = runTracedAgentMock.mock.calls[0]?.[2] as {
      inputGuardrails: { name: string; runInParallel?: boolean }[];
      outputGuardrails: { name: string }[];
    };
    expect(agent.inputGuardrails[0]?.name).toBe("Customer intent guardrail");
    expect(agent.inputGuardrails[0]?.runInParallel).toBe(false);
    expect(agent.outputGuardrails[0]?.name).toBe("Customer reply guardrail");
  });
});
