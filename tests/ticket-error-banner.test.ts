import { describe, expect, it } from "vitest";
import { ticketErrorHeadline, ticketErrorReason } from "../frontend/src/lib/ticket-error";

// The Inbox banner when talking to Jira failed (26 Nov: a conversation that already had SDS-53 said "Jira ticket wasn't
// created", because a later attempt to add to it hit the AI provider's credit limit).

describe("the banner's headline", () => {
  it("says the update failed, naming the ticket, when the conversation already has one", () => {
    expect(ticketErrorHeadline("SDS-53")).toBe("Couldn’t update SDS-53.");
  });

  it("says no ticket was created when the conversation has none", () => {
    expect(ticketErrorHeadline(null)).toBe("Jira ticket wasn’t created.");
    expect(ticketErrorHeadline("  ")).toBe("Jira ticket wasn’t created.");
  });
});

describe("the reason", () => {
  it("reads the provider's credit error as out of credits, not as busy", () => {
    expect(ticketErrorReason("Eva couldn't choose a request type: 429 You have no credits remaining.")).toBe("The AI provider is out of credits. Add credits to fix this.");
    expect(ticketErrorReason("429 Rate limit reached")).toBe("The AI provider is busy. Try again in a few minutes.");
  });
});
