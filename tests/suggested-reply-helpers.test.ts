import { describe, expect, it } from "vitest";
import { retrievalQueryFor, usableStyleExamples } from "@/lib/suggested-reply";

const customer = (body: string) => ({ senderType: "customer" as const, body });
const agent = (body: string) => ({ senderType: "agent" as const, body });

describe("what the drafter looks up in the help articles", () => {
  it("uses the customer's message as it is when it says enough on its own", () => {
    expect(retrievalQueryFor([customer("How do I reset my password for the EAP portal?")])).toBe("How do I reset my password for the EAP portal?");
  });

  it("adds what the customer asked before when the latest message is a short follow-up", () => {
    const query = retrievalQueryFor([
      customer("How do I register members for the Self-Scheduler?"),
      agent("Share the registration link."),
      customer("that didn't work"),
    ]);
    expect(query).toContain("Self-Scheduler");
    expect(query).toContain("that didn't work");
  });

  it("only searches what the customer wrote, never the worker's or the team's lines", () => {
    const query = retrievalQueryFor([customer("Printer is offline in the lab"), agent("INTERNAL: escalate"), customer("still")]);
    expect(query).not.toContain("INTERNAL");
  });

  it("copes with a conversation with no customer message", () => {
    expect(retrievalQueryFor([agent("hello")])).toBe("");
  });
});

describe("how the team writes: the examples the drafter is shown", () => {
  const good = "Thanks for waiting. I've reset your session, so please log back in and let me know if it still freezes.";
  const other = "Hi there, the report is under Reports, then Utilization. Choose the month and press Run, and it will download.";

  it("keeps real replies, drops test messages and one-word replies", () => {
    expect(usableStyleExamples(["test", "Test reply to check the chat is working properly now", "ok", good, other])).toEqual([good, other]);
  });

  it("drops replies carrying another customer's email address, link or phone number", () => {
    expect(
      usableStyleExamples([
        "Thanks, I've emailed jane.doe@example.com the steps and she should have them within a few minutes.",
        "Please see https://example.com/portal/help for the full guide, which has every step in order.",
        "I called the member on 4165551234 and walked them through the registration step by step.",
        good,
      ]),
    ).toEqual([good]);
  });

  it("does not show the same reply twice, and stops at the number asked for", () => {
    expect(usableStyleExamples([good, good.toUpperCase(), other])).toEqual([good, other]);
    const many = Array.from({ length: 12 }, (_, i) => `${good} Reply number ${i}, written a little differently each time.`);
    expect(usableStyleExamples(many)).toHaveLength(5);
  });
});
