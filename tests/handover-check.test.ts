import { describe, expect, it, vi } from "vitest";
import { decideHandover, handoverNeedsCheck, workerAlreadyAsked, type HandoverCheckInput } from "@/lib/handover-check";

// The second look at a handover: when it runs, when it does not, and that a second scoping question is never asked.

const base: HandoverCheckInput = {
  message: "And how do I change their security role afterwards?",
  history: [],
  workerName: "Eva",
  sections: [{ documentId: "confluence:1", title: "Security", heading: null, content: "Open Staff/Security and edit the role.", rank: 1 }],
  escalationTerms: ["refund", "legal"],
  withTeam: false,
  role: "First-line support",
};
const handoverDraft = true;

describe("when the check runs", () => {
  it("runs on a plain handover", () => {
    expect(handoverNeedsCheck(handoverDraft, base)).toBe(true);
  });

  it("does not run on an answer, which never pays for it", () => {
    expect(handoverNeedsCheck(false, base)).toBe(false);
  });

  it("does not run when the customer asked for a person or a ticket", () => {
    expect(handoverNeedsCheck(handoverDraft, { ...base, message: "Please create a ticket for me" })).toBe(false);
    expect(handoverNeedsCheck(handoverDraft, { ...base, message: "can I talk to a person" })).toBe(false);
  });

  it("does not run for an escalation term, or a chat already with the team", () => {
    expect(handoverNeedsCheck(handoverDraft, { ...base, message: "I want a refund" })).toBe(false);
    expect(handoverNeedsCheck(handoverDraft, { ...base, withTeam: true })).toBe(false);
  });
});

describe("one scoping question per conversation", () => {
  const asked = [{ speaker: "Eva", body: "What exact error message do you see?" }];

  it("notices a question the worker already asked", () => {
    expect(workerAlreadyAsked(asked, "Eva")).toBe(true);
    expect(workerAlreadyAsked([{ speaker: "Customer", body: "Is it down?" }], "Eva")).toBe(false);
    expect(workerAlreadyAsked([{ speaker: "Eva", body: "Open Staff/Security. Did that solve it?" }], "Eva")).toBe(true);
    expect(workerAlreadyAsked([{ speaker: "Eva", body: "Steps done. [[RESOLVE]]" }], "Eva")).toBe(false);
  });

  it("turns a second needs_scoping into a handover", async () => {
    const judge = vi.fn(async () => "needs_scoping" as const);
    expect(await decideHandover(handoverDraft, { ...base, history: asked }, judge)).toBe("handover");
    expect(await decideHandover(handoverDraft, base, judge)).toBe("needs_scoping");
  });
});

describe("the verdicts pass through", () => {
  it("returns covered, and null when no check applies", async () => {
    expect(await decideHandover(handoverDraft, base, async () => "covered")).toBe("covered");
    const judge = vi.fn(async () => "covered" as const);
    expect(await decideHandover(false, base, judge)).toBeNull();
    expect(judge).not.toHaveBeenCalled();
  });
});

import { askForMoreReply, isVagueOnlyTrip, type IntentClassification } from "@/lib/guardrails";

describe("a message too vague to classify wants a question, not a person", () => {
  const intent = (over: Partial<IntentClassification>): IntentClassification => ({ outOfScope: false, escalate: false, injectionSuspected: false, confidence: 0.2, reason: "unclear", matchedThemes: [], ...over }) as IntentClassification;

  it("is vague only when nothing else tripped it", () => {
    expect(isVagueOnlyTrip(intent({}), 0.75)).toBe(true);
    expect(isVagueOnlyTrip(intent({ injectionSuspected: true }), 0.75)).toBe(false);
    expect(isVagueOnlyTrip(intent({ outOfScope: true }), 0.75)).toBe(false);
    expect(isVagueOnlyTrip(intent({ escalate: true, reason: "billing" }), 0.75)).toBe(false);
    expect(isVagueOnlyTrip(intent({ matchedThemes: ["refund"] }), 0.75)).toBe(false);
    expect(isVagueOnlyTrip(intent({ reason: "Guardrail classifier failed" }), 0.75)).toBe(false);
    expect(isVagueOnlyTrip(intent({ confidence: 0.8 }), 0.75)).toBe(false);
  });

  it("asks one open question and hands nothing over", () => {
    const reply = askForMoreReply({ confidenceThreshold: 0.75 });
    expect(reply.escalate).toBe(false);
    expect(reply.answer).toMatch(/\?$/);
  });
});
