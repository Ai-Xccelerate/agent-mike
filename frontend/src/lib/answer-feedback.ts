/** What a manager can say was wrong with a reply. Mirrors the API's lib/answer-feedback.ts. */
export const FEEDBACK_REASONS = [
  "wrong_answer",
  "should_have_handed_over",
  "handed_over_too_soon",
  "wrong_request_type",
  "wrong_priority",
  "unsafe",
  "other",
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  wrong_answer: "Wrong answer",
  should_have_handed_over: "Should have handed over",
  handed_over_too_soon: "Handed over too soon",
  wrong_request_type: "Wrong request type",
  wrong_priority: "Wrong priority",
  unsafe: "Unsafe",
  other: "Something else",
};

export const CORRECTION_MAX_LENGTH = 1000;
