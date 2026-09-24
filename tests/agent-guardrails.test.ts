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
import { declineOutOfScopeReply } from "@/lib/guardrails";

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
          outputInfo: {
            injectionSuspected: false,
            outOfScope: false,
            escalate: true,
            matchedThemes: [],
            confidence: 0.1,
            reason: "billing",
          },
        },
      }),
    );

    const result = await runAgent(profile, "Acme", "I want my money back", [], "org-1");
    expect(result).toEqual(handoffToManager(profile));
  });

  it("declines out-of-scope input instead of handing off to the manager", async () => {
    runTracedAgentMock.mockRejectedValue(
      new InputGuardrailTripwireTriggered("tripped", {
        guardrail: { type: "input", name: "Customer intent guardrail" },
        output: {
          tripwireTriggered: true,
          outputInfo: {
            injectionSuspected: false,
            outOfScope: true,
            escalate: false,
            matchedThemes: [],
            confidence: 0.92,
            reason: "general programming homework",
          },
        },
      }),
    );

    const result = await runAgent(
      profile,
      "Acme",
      "Can you help me fix this Python code?",
      [],
      "org-1",
    );
    expect(result).toEqual(declineOutOfScopeReply(profile));
    expect(result.escalate).toBe(false);
    expect(result.answer).toContain("outside what I cover");
  });

  it("maps OutputGuardrailTripwireTriggered to the manager handoff", async () => {
    runTracedAgentMock.mockRejectedValue(
      new OutputGuardrailTripwireTriggered("tripped", {
        guardrail: { type: "output", name: "Customer reply guardrail" },
        agent: {} as never,
        agentOutput: "leaked",
        output: {
          tripwireTriggered: true,
          outputInfo: { action: "block", confidence: 0, reason: "leak" },
        },
      }),
    );

    const result = await runAgent(profile, "Acme", "hi", [], "org-1");
    expect(result.escalate).toBe(true);
    expect(result.answer).toContain("Charan");
  });

  it("repairs a blocked draft using the classifier reason instead of handing off", async () => {
    runTracedAgentMock
      .mockResolvedValueOnce({
        finalOutput: "Sure, I processed your refund already. [[RESOLVE]]",
        inputGuardrailResults: [],
        outputGuardrailResults: [
          {
            guardrail: { name: "Customer reply guardrail" },
            output: {
              tripwireTriggered: false,
              outputInfo: {
                action: "block",
                confidence: 0.05,
                reason: "claims to have processed a refund",
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        finalOutput: "I can't process refunds myself. What's the best email for billing to reach you? [[FOLLOWUP]]",
        inputGuardrailResults: [],
        outputGuardrailResults: [
          {
            guardrail: { name: "Customer reply guardrail" },
            output: {
              tripwireTriggered: false,
              outputInfo: {
                action: "continue_intake",
                confidence: 0.9,
                reason: "asking for email",
              },
            },
          },
        ],
      });

    const result = await runAgent(profile, "Acme", "I want a refund", [], "org-1");
    expect(result.escalate).toBe(false);
    expect(result.answer).toContain("email");
    expect(result.answer).not.toContain("processed your refund");
    expect(runTracedAgentMock).toHaveBeenCalledTimes(2);
    const repairInput = runTracedAgentMock.mock.calls[1]?.[3] as string;
    expect(repairInput).toContain("claims to have processed a refund");
    expect(repairInput).toContain("Sure, I processed your refund already.");
  });

  it("hands off when a repair is blocked again", async () => {
    runTracedAgentMock.mockResolvedValue({
      finalOutput: "I issued your refund. [[RESOLVE]]",
      inputGuardrailResults: [],
      outputGuardrailResults: [
        {
          guardrail: { name: "Customer reply guardrail" },
          output: {
            tripwireTriggered: false,
            outputInfo: {
              action: "block",
              confidence: 0,
              reason: "still promising a refund",
            },
          },
        },
      ],
    });

    const result = await runAgent(profile, "Acme", "I want a refund", [], "org-1");
    expect(result).toEqual(handoffToManager(profile));
    expect(runTracedAgentMock).toHaveBeenCalledTimes(2);
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
              outOfScope: false,
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

  it("demotes premature [[ESCALATE]] when reply policy is continue_intake", async () => {
    runTracedAgentMock.mockResolvedValue({
      finalOutput: "What's the best email to reach you?\n[[ESCALATE]]",
      inputGuardrailResults: [],
      outputGuardrailResults: [
        {
          guardrail: { name: "Customer reply guardrail" },
          output: {
            tripwireTriggered: false,
            outputInfo: {
              action: "continue_intake",
              confidence: 0.9,
              reason: "asking for email before handoff",
            },
          },
        },
      ],
    });

    const result = await runAgent(profile, "Acme", "I want a refund", [], "org-1");
    expect(result.escalate).toBe(false);
    expect(result.answer).toContain("email");
    expect(result.answer).not.toMatch(/\[\[ESCALATE\]\]/i);
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


describe("runAgent KB grounding", () => {
  const signInQuestion = "My sign-in code never arrived";
  const genericDraft =
    "Please check your spam/junk folder and confirm the email address or phone number is correct. " +
    "Then request a new code and wait a few minutes before retrying. [[FOLLOWUP]]";

  function replyPolicy(action: "continue_intake" | "escalate" | "block", reason: string) {
    return [
      {
        guardrail: { name: "Customer reply guardrail" },
        output: { tripwireTriggered: false, outputInfo: { action, confidence: 0.9, reason } },
      },
    ];
  }

  it("tells the run there is no KB material, so guardrails can enforce grounding", async () => {
    runTracedAgentMock.mockResolvedValue({ finalOutput: "Hi! [[FOLLOWUP]]", inputGuardrailResults: [] });
    await runAgent(profile, "Acme", signInQuestion, [], "org-1");
    const agent = runTracedAgentMock.mock.calls[0]?.[2] as { instructions: string };
    const options = runTracedAgentMock.mock.calls[0]?.[4] as { context: { referenceMaterialFound?: boolean } };
    expect(agent.instructions).toContain("Grounding rule");
    expect(options.context.referenceMaterialFound).toBe(false);
  });

  it("marks reference material as found when retrieval returned a match", async () => {
    runTracedAgentMock.mockResolvedValue({ finalOutput: "Codes expire in 10 minutes. [[FOLLOWUP]]", inputGuardrailResults: [] });
    await runAgent(
      profile,
      "Acme",
      signInQuestion,
      [{ title: "Sign-in codes", heading: null, content: "Codes expire after 10 minutes." } as never],
      "org-1",
    );
    const options = runTracedAgentMock.mock.calls[0]?.[4] as { context: { referenceMaterialFound?: boolean } };
    expect(options.context.referenceMaterialFound).toBe(true);
  });

  it("replaces an ungrounded sign-in-code answer with a handoff when the KB has no match", async () => {
    runTracedAgentMock
      .mockResolvedValueOnce({
        finalOutput: genericDraft,
        inputGuardrailResults: [],
        outputGuardrailResults: replyPolicy("block", "answers a support question from general knowledge"),
      })
      .mockResolvedValueOnce({
        finalOutput: "I don't want to guess on this one, so I'm bringing in a teammate who can check your account. [[ESCALATE]]",
        inputGuardrailResults: [],
        outputGuardrailResults: replyPolicy("escalate", "hands off to a human"),
      });

    const result = await runAgent(profile, "Acme", signInQuestion, [], "org-1");
    expect(result.escalate).toBe(true);
    expect(result.answer).toContain("teammate");
    expect(result.answer).not.toMatch(/spam|junk|request a new code/i);
    const repairInput = runTracedAgentMock.mock.calls[1]?.[3] as string;
    expect(repairInput).toContain("answers a support question from general knowledge");
  });

  it("falls back to the manager handoff if the repaired sign-in answer is still ungrounded", async () => {
    runTracedAgentMock.mockResolvedValue({
      finalOutput: genericDraft,
      inputGuardrailResults: [],
      outputGuardrailResults: replyPolicy("block", "answers a support question from general knowledge"),
    });

    const result = await runAgent(profile, "Acme", signInQuestion, [], "org-1");
    expect(result).toEqual(handoffToManager(profile));
  });

  it("still answers a greeting normally with no KB match", async () => {
    runTracedAgentMock.mockResolvedValue({
      finalOutput: "Hi there! What can I help you with today? [[FOLLOWUP]]",
      inputGuardrailResults: [],
      outputGuardrailResults: replyPolicy("continue_intake", "greeting, no support claims"),
    });

    const result = await runAgent(profile, "Acme", "hi", [], "org-1");
    expect(result.escalate).toBe(false);
    expect(result.answer).toBe("Hi there! What can I help you with today?");
    expect(runTracedAgentMock).toHaveBeenCalledTimes(1);
  });
});
