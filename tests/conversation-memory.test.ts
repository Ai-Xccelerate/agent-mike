import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildInputWithHistory,
  maybeRefreshConversationSummary,
  REPLAY_MESSAGE_LIMIT,
} from "@/lib/conversation-memory";

const runMock = vi.hoisted(() => vi.fn());

vi.mock("@openai/agents", () => ({
  Agent: class {
    constructor(public readonly options: unknown) {}
  },
  run: runMock,
}));

const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  runMock.mockReset();
  process.env.DEMO_MODE = "false";
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

describe("buildInputWithHistory", () => {
  it("returns the bare message on the first turn", () => {
    expect(buildInputWithHistory([], "How do I invite a teammate?", "Customer", null)).toBe(
      "How do I invite a teammate?",
    );
  });

  it("replays prior turns and labels the current speaker", () => {
    const input = buildInputWithHistory(
      [
        { speaker: "Customer", body: "My code never arrived" },
        { speaker: "Mike", body: "Check spam, then tap Resend." },
      ],
      "Still nothing",
      "Customer",
      null,
    );
    expect(input).toContain("Earlier in this conversation:");
    expect(input).toContain("Customer: My code never arrived");
    expect(input).toContain("Mike: Check spam, then tap Resend.");
    expect(input.endsWith("Customer: Still nothing")).toBe(true);
  });

  it("prepends a rolling summary when one exists", () => {
    const input = buildInputWithHistory([], "What next?", "Customer", "Customer asked about sign-in codes.");
    expect(input.startsWith("Summary of earlier parts of this conversation:")).toBe(true);
    expect(input).toContain("Customer asked about sign-in codes.");
    expect(input).toContain("What next?");
  });
});

describe("maybeRefreshConversationSummary", () => {
  it("does nothing until the replay window overflows", async () => {
    const turns = Array.from({ length: REPLAY_MESSAGE_LIMIT }, (_, i) => ({
      speaker: i % 2 === 0 ? "Customer" : "Mike",
      body: `turn ${i}`,
    }));
    const current = { summary: null, summarizedMessageCount: 0 };
    const next = await maybeRefreshConversationSummary({ model: "gpt-test" }, current, turns, "customer");
    expect(next).toEqual(current);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("folds the newly-old batch and advances the watermark", async () => {
    runMock.mockResolvedValue({ finalOutput: "Customer had a sign-in issue; Mike walked them through Resend." });
    const turns = Array.from({ length: REPLAY_MESSAGE_LIMIT + 2 }, (_, i) => ({
      speaker: i % 2 === 0 ? "Customer" : "Mike",
      body: `turn ${i}`,
    }));

    const next = await maybeRefreshConversationSummary(
      { model: "gpt-test" },
      { summary: null, summarizedMessageCount: 0 },
      turns,
      "customer",
    );

    expect(runMock).toHaveBeenCalledOnce();
    expect(next.summarizedMessageCount).toBe(2);
    expect(next.summary).toContain("sign-in");
  });

  it("leaves state unchanged when the model is unavailable", async () => {
    process.env.DEMO_MODE = "true";
    const turns = Array.from({ length: REPLAY_MESSAGE_LIMIT + 1 }, (_, i) => ({
      speaker: "Customer",
      body: `turn ${i}`,
    }));
    const current = { summary: null, summarizedMessageCount: 0 };
    const next = await maybeRefreshConversationSummary({ model: "gpt-test" }, current, turns, "customer");
    expect(next).toEqual(current);
    expect(runMock).not.toHaveBeenCalled();
  });
});
