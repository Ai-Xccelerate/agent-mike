import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { answerFeedback, conversations, messages } from "@/db/schema";
import { outputGuardrailMode } from "@/lib/guardrails";

/**
 * A manager's verdict on one of the worker's replies. Good or bad; for bad, what was wrong and, optionally, what it
 * should have said. Kept inside Mike. One verdict per person per reply, which they can change or take back.
 */

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

export const feedbackInputSchema = z
  .object({
    rating: z.enum(["good", "bad"]),
    reasons: z.array(z.enum(FEEDBACK_REASONS)).max(FEEDBACK_REASONS.length).default([]),
    correction: z
      .string()
      .max(CORRECTION_MAX_LENGTH, `Keep the correction under ${CORRECTION_MAX_LENGTH} characters`)
      .nullish()
      .transform((value) => value?.trim() || null),
  })
  // A good rating carries no reasons or correction: they only describe what went wrong.
  .transform((value) => (value.rating === "good" ? { rating: "good" as const, reasons: [] as FeedbackReason[], correction: null } : { ...value, reasons: [...new Set(value.reasons)] }));

export type FeedbackInput = z.output<typeof feedbackInputSchema>;

export type FeedbackView = {
  messageId: string;
  rating: "good" | "bad";
  reasons: FeedbackReason[];
  correction: string | null;
  /** Whether this is the signed-in manager's own rating. */
  mine: boolean;
  ratedAt: string;
};

/** What the worker was running when it wrote the reply, so a bad rating can be traced to a setting. */
export function feedbackContext(profile: { model: string; identityMode?: string | null }): Record<string, unknown> {
  return {
    model: profile.model,
    identityMode: profile.identityMode ?? "off",
    outputGuardrailMode: outputGuardrailMode(),
    release: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
  };
}

export type SaveResult = { ok: true; feedback: FeedbackView } | { ok: false; status: 404; error: string };

/**
 * Saves (or changes) a manager's rating of a reply. Only the worker's own replies in this organization's customer
 * or Playground conversations can be rated; anything else is "not found", so a foreign id reveals nothing.
 */
export async function saveFeedback(input: {
  organizationId: string;
  messageId: string;
  ratedBy: string;
  feedback: FeedbackInput;
  context: Record<string, unknown>;
}): Promise<SaveResult> {
  const [message] = await db
    .select({ id: messages.id, conversationId: messages.conversationId, senderType: messages.senderType, channel: conversations.channel })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, input.messageId), eq(conversations.organizationId, input.organizationId)))
    .limit(1);
  if (!message || message.senderType !== "agent" || message.channel === "assistant") {
    return { ok: false, status: 404, error: "That reply can't be rated" };
  }

  const values = {
    organizationId: input.organizationId,
    conversationId: message.conversationId,
    messageId: message.id,
    ratedBy: input.ratedBy,
    rating: input.feedback.rating,
    reasons: input.feedback.reasons,
    correction: input.feedback.correction,
    context: input.context,
  };
  const [row] = await db
    .insert(answerFeedback)
    .values(values)
    .onConflictDoUpdate({
      target: [answerFeedback.messageId, answerFeedback.ratedBy],
      set: { rating: values.rating, reasons: values.reasons, correction: values.correction, context: values.context, updatedAt: new Date() },
    })
    .returning();
  return { ok: true, feedback: toView(row, input.ratedBy) };
}

/** Takes back the signed-in manager's own rating. Reports whether there was one. */
export async function removeFeedback(input: { organizationId: string; messageId: string; ratedBy: string }): Promise<boolean> {
  const removed = await db
    .delete(answerFeedback)
    .where(and(eq(answerFeedback.organizationId, input.organizationId), eq(answerFeedback.messageId, input.messageId), eq(answerFeedback.ratedBy, input.ratedBy)))
    .returning({ id: answerFeedback.id });
  return removed.length > 0;
}

function toView(row: typeof answerFeedback.$inferSelect, viewer: string): FeedbackView {
  return {
    messageId: row.messageId,
    rating: row.rating === "bad" ? "bad" : "good",
    reasons: (row.reasons ?? []).filter((reason): reason is FeedbackReason => (FEEDBACK_REASONS as readonly string[]).includes(reason)),
    correction: row.correction,
    mine: row.ratedBy === viewer,
    ratedAt: row.updatedAt.toISOString(),
  };
}

/** Every rating on a set of conversations' replies, grouped by conversation, newest first, with the viewer's own flagged. One query. */
export async function feedbackForConversations(organizationId: string, conversationIds: string[], viewer: string): Promise<Map<string, FeedbackView[]>> {
  const grouped = new Map<string, FeedbackView[]>();
  if (conversationIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(answerFeedback)
    .where(and(eq(answerFeedback.organizationId, organizationId), inArray(answerFeedback.conversationId, conversationIds)))
    .orderBy(desc(answerFeedback.updatedAt));
  for (const row of rows) {
    const list = grouped.get(row.conversationId) ?? [];
    list.push(toView(row, viewer));
    grouped.set(row.conversationId, list);
  }
  return grouped;
}

/** Every rating on one conversation's replies, newest first, flagged with which are the viewer's own. */
export async function feedbackForConversation(organizationId: string, conversationId: string, viewer: string): Promise<FeedbackView[]> {
  return (await feedbackForConversations(organizationId, [conversationId], viewer)).get(conversationId) ?? [];
}

export type FeedbackSummary = {
  rated: number;
  good: number;
  bad: number;
  /** What was wrong, most common first. Every reason on every bad rating counts. */
  byReason: { reason: FeedbackReason; count: number }[];
};

/** The Overview's answer quality for a set of conversations. A reply rated by two managers counts as two ratings. */
export async function feedbackSummary(organizationId: string, conversationIds: string[]): Promise<FeedbackSummary> {
  const rows = conversationIds.length
    ? await db
        .select({ rating: answerFeedback.rating, reasons: answerFeedback.reasons })
        .from(answerFeedback)
        .where(and(eq(answerFeedback.organizationId, organizationId), inArray(answerFeedback.conversationId, conversationIds)))
    : [];
  const counts = new Map<FeedbackReason, number>();
  let good = 0;
  let bad = 0;
  for (const row of rows) {
    if (row.rating === "good") good += 1;
    else {
      bad += 1;
      for (const reason of row.reasons ?? []) {
        if ((FEEDBACK_REASONS as readonly string[]).includes(reason)) counts.set(reason as FeedbackReason, (counts.get(reason as FeedbackReason) ?? 0) + 1);
      }
    }
  }
  const byReason = [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { rated: good + bad, good, bad, byReason };
}
