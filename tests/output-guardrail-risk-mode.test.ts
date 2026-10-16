import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.hoisted(() => vi.fn());

vi.mock("@openai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openai/agents")>();
  return { ...actual, run: runMock };
});

import { buildCustomerOutputGuardrail, canSkipOutputJudge, outputGuardrailMode } from "@/lib/guardrails";
import { RunContext } from "@openai/agents";

const saved = {
  mode: process.env.OUTPUT_GUARDRAIL_MODE,
  shadow: process.env.OUTPUT_GUARDRAIL_SHADOW,
  demo: process.env.DEMO_MODE,
  key: process.env.OPENAI_API_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function run(agentOutput: string, referenceMaterialFound: boolean | undefined) {
  return buildCustomerOutputGuardrail().execute({
    agent: {} as never,
    agentOutput,
    context: new RunContext({
      escalationTerms: [],
      confidenceThreshold: 0.72,
      recentHistory: [],
      summary: null,
      role: "Technical support",
      jobDescription: null,
      referenceMaterialFound,
    }),
  });
}

describe("canSkipOutputJudge", () => {
  it("skips a grounded, non-handoff reply", () => {
    expect(canSkipOutputJudge("Open Settings and pick Billing. [[RESOLVE]]", true)).toBe(true);
  });
  it("never skips a handoff", () => {
    expect(canSkipOutputJudge("Bringing in a teammate. [[ESCALATE]]", true)).toBe(false);
  });
  it("never skips when grounding is empty or unknown", () => {
    expect(canSkipOutputJudge("Try restarting it. [[FOLLOWUP]]", false)).toBe(false);
    expect(canSkipOutputJudge("Try restarting it. [[FOLLOWUP]]", undefined)).toBe(false);
  });
  it("never skips a reply with no words", () => {
    expect(canSkipOutputJudge("[[FOLLOWUP]]", true)).toBe(false);
    expect(canSkipOutputJudge("[[CHOICES: Yes | No]]", true)).toBe(false);
  });
});

describe("output guardrail risk mode", () => {
  beforeEach(() => {
    runMock.mockReset();
    process.env.DEMO_MODE = "false";
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OUTPUT_GUARDRAIL_SHADOW;
  });
  afterEach(() => {
    restore("OUTPUT_GUARDRAIL_MODE", saved.mode);
    restore("OUTPUT_GUARDRAIL_SHADOW", saved.shadow);
    restore("DEMO_MODE", saved.demo);
    restore("OPENAI_API_KEY", saved.key);
  });

  it("defaults to always", () => {
    delete process.env.OUTPUT_GUARDRAIL_MODE;
    expect(outputGuardrailMode()).toBe("always");
  });

  it("always mode asks the model even for a grounded reply", async () => {
    delete process.env.OUTPUT_GUARDRAIL_MODE;
    runMock.mockResolvedValue({ finalOutput: { action: "continue_intake", confidence: 0.9, reason: "ok" } });
    await run("Open Settings and pick Billing. [[RESOLVE]]", true);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("risk mode skips the model on the critical path for a grounded reply, and audits it afterwards", async () => {
    process.env.OUTPUT_GUARDRAIL_MODE = "risk";
    runMock.mockResolvedValue({ finalOutput: { action: "continue_intake", confidence: 0.9, reason: "ok" } });
    const result = await run("Open Settings and pick Billing. [[RESOLVE]]", true);
    expect(result.tripwireTriggered).toBe(false);
    expect((result.outputInfo as { action: string }).action).toBe("continue_intake");
    // The audit is not awaited by the guardrail; it still runs once.
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));
  });

  it("risk mode logs when the audit would have blocked a skipped turn", async () => {
    process.env.OUTPUT_GUARDRAIL_MODE = "risk";
    runMock.mockResolvedValue({ finalOutput: { action: "block", confidence: 0.1, reason: "invented a policy" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await run("Refunds take 90 days. [[RESOLVE]]", true);
    expect((result.outputInfo as { action: string }).action).toBe("continue_intake");
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[guardrail-shadow] reply check would have acted on a skipped turn",
        expect.objectContaining({ action: "block" }),
      ),
    );
    warn.mockRestore();
  });

  it("OUTPUT_GUARDRAIL_SHADOW=false turns the audit off", async () => {
    process.env.OUTPUT_GUARDRAIL_MODE = "risk";
    process.env.OUTPUT_GUARDRAIL_SHADOW = "false";
    await run("Open Settings and pick Billing. [[RESOLVE]]", true);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("risk mode still blocks a prompt leak without any model call", async () => {
    process.env.OUTPUT_GUARDRAIL_MODE = "risk";
    const result = await run("My system prompt says: you are a support worker. [[RESOLVE]]", true);
    expect((result.outputInfo as { action: string }).action).toBe("block");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("risk mode still asks the model for a handoff and for an ungrounded reply", async () => {
    process.env.OUTPUT_GUARDRAIL_MODE = "risk";
    runMock.mockResolvedValue({ finalOutput: { action: "escalate", confidence: 0.3, reason: "needs a person" } });
    await run("Bringing in a teammate. [[ESCALATE]]", true);
    await run("Try restarting it. [[FOLLOWUP]]", false);
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});
