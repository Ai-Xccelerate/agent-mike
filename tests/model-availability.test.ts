import { afterEach, describe, expect, it } from "vitest";
import { modelUnavailabilityReason } from "@/lib/env";
import { handoffToManager, runAgent, type WorkerProfileLike } from "@/lib/agent";
import { runAssistantAgent } from "@/lib/assistant-agent";
import type { workerProfiles } from "@/db/schema";

type Profile = typeof workerProfiles.$inferSelect;

const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

function worker(overrides: Partial<WorkerProfileLike> = {}): WorkerProfileLike {
  return {
    displayName: "Mike",
    role: "Support",
    tone: "warm",
    systemPromptTemplate: "",
    model: "gpt-test",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    managerName: "Priya",
    ...overrides,
  };
}

function assistantProfile(): Profile {
  return {
    displayName: "Mike",
    managerName: "Priya",
    model: "gpt-test",
    maxAgentTurns: 3,
  } as Profile;
}

describe("modelUnavailabilityReason", () => {
  it("returns demo_mode even when the API key is also missing", () => {
    process.env.DEMO_MODE = "true";
    delete process.env.OPENAI_API_KEY;
    expect(modelUnavailabilityReason()).toBe("demo_mode");
  });

  it("returns missing_api_key when demo mode is off and there is no key", () => {
    process.env.DEMO_MODE = "false";
    delete process.env.OPENAI_API_KEY;
    expect(modelUnavailabilityReason()).toBe("missing_api_key");
  });

  it("returns null when the model can actually be called", () => {
    process.env.DEMO_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(modelUnavailabilityReason()).toBeNull();
  });
});

describe("runAgent unavailable paths", () => {
  it("keeps canned demo answers when DEMO_MODE is on", async () => {
    process.env.DEMO_MODE = "true";
    process.env.OPENAI_API_KEY = "sk-test";

    const withKnowledge = await runAgent(
      worker(),
      "Acme",
      "How do I sign in?",
      [
        {
          documentId: "doc-1",
          title: "Sign-in",
          heading: null,
          content: "Use the code from your email.",
          rank: 1,
        },
      ],
      "org-demo",
    );
    expect(withKnowledge.escalate).toBe(false);
    expect(withKnowledge.answer).toContain("Based on \"Sign-in\"");
    expect(withKnowledge.citations).toEqual(["Sign-in"]);

    const withoutKnowledge = await runAgent(worker(), "Acme", "Hello", [], "org-demo");
    expect(withoutKnowledge).toEqual({
      answer:
        "I want to make sure this is handled correctly, so I'm bringing in Priya. They'll review the conversation and follow up here.",
      confidence: 0.28,
      escalate: true,
      citations: [],
    });
  });

  it("handoffs instead of faking an answer when the API key is missing", async () => {
    process.env.DEMO_MODE = "false";
    delete process.env.OPENAI_API_KEY;

    const result = await runAgent(
      worker(),
      "Acme",
      "How do I sign in?",
      [
        {
          documentId: "doc-1",
          title: "Sign-in",
          heading: null,
          content: "Use the code from your email.",
          rank: 1,
        },
      ],
      "org-nokey",
    );
    expect(result).toEqual(handoffToManager(worker()));
    expect(result.answer).not.toContain("Based on");
    expect(result.answer).not.toContain("OPENAI_API_KEY");
  });
});

describe("runAssistantAgent unavailable paths", () => {
  it("blames demo mode, not a missing key, when DEMO_MODE is on", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.OPENAI_API_KEY;

    const result = await runAssistantAgent(
      assistantProfile(),
      "org-demo",
      "conv-demo",
      "What are the guardrails?",
      [],
      null,
    );
    expect(result.answer).toContain("demo mode is on");
    expect(result.answer).not.toContain("OPENAI_API_KEY");
  });

  it("blames a missing key only when demo mode is off", async () => {
    process.env.DEMO_MODE = "false";
    delete process.env.OPENAI_API_KEY;

    const result = await runAssistantAgent(
      assistantProfile(),
      "org-nokey",
      "conv-nokey",
      "What are the guardrails?",
      [],
      null,
    );
    expect(result.answer).toContain("no OPENAI_API_KEY configured");
    expect(result.answer).not.toContain("demo mode");
  });
});
