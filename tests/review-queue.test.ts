import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { answerFeedback, conversations, messages } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { groupReviewItems, loadReviewItems, type ReviewItem } from "@/lib/review-queue";

const item = (id: string, question: string, kind: ReviewItem["kind"] = "no_article", at = "2026-10-20T10:00:00.000Z"): ReviewItem => ({
  id,
  kind,
  conversationId: "c",
  ticketNumber: 1001,
  question,
  answer: "a",
  citations: [],
  reasons: [],
  correction: null,
  at,
});

describe("grouping what needs review", () => {
  it("puts questions about the same thing together, biggest group first", () => {
    const groups = groupReviewItems([
      item("1", "How do I set up appointment modalities for the Self-Scheduler?"),
      item("2", "Where do I configure modalities in the Self-Scheduler?", "bad_rating"),
      item("3", "How do I reset my password?"),
      item("4", "Self-Scheduler appointment modalities are missing"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(3);
    expect(groups[0].kinds).toMatchObject({ no_article: 2, bad_rating: 1, team_answer: 0 });
    expect(groups[1].items[0].id).toBe("3");
  });

  it("is empty for no items", () => {
    expect(groupReviewItems([])).toEqual([]);
  });
});

describe("what the queue finds", () => {
  let orgId: string;
  beforeEach(async () => {
    orgId = `org-review-${crypto.randomUUID()}`;
    await ensureOrganization(orgId);
  });

  async function say(conversationId: string, senderType: string, body: string, citations: string[] = [], offsetMs = 0) {
    const [row] = await db
      .insert(messages)
      .values({ conversationId, senderType, senderName: senderType, body, citations, createdAt: new Date(Date.now() - 100000 + offsetMs) })
      .returning();
    return row;
  }

  it("finds a handed-over question with no article, and what the team then said", async () => {
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
    await say(conversation.id, "customer", "How do I set up modalities?", [], 0);
    await say(conversation.id, "agent", "I couldn't find that. A teammate will help.", [], 1000);
    await say(conversation.id, "manager", "Open Working Hours and tick the modality.", [], 2000);
    const items = await loadReviewItems(orgId);
    expect(items.map((entry) => entry.kind).sort()).toEqual(["no_article", "team_answer"]);
    expect(items.find((entry) => entry.kind === "team_answer")?.answer).toContain("Working Hours");
    expect(items.every((entry) => entry.question === "How do I set up modalities?")).toBe(true);
  });

  it("finds a reply rated bad, with its reasons and correction, and ignores good ratings and answered chats", async () => {
    const bad = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await say(bad.id, "customer", "How do I reset my password?", [], 0);
    const reply = await say(bad.id, "agent", "Use the link.", ["Reset password"], 1000);
    await db.insert(answerFeedback).values({
      organizationId: orgId,
      conversationId: bad.id,
      messageId: reply.id,
      rating: "bad",
      reasons: ["wrong_answer"],
      correction: "Say the minimum is 12 characters.",
      ratedBy: "u1",
    });
    const good = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await say(good.id, "customer", "Who are you?", [], 0);
    const fine = await say(good.id, "agent", "I'm Eva.", [], 1000);
    await db.insert(answerFeedback).values({ organizationId: orgId, conversationId: good.id, messageId: fine.id, rating: "good", ratedBy: "u1" });

    const items = await loadReviewItems(orgId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "bad_rating", reasons: ["Wrong answer"], correction: "Say the minimum is 12 characters.", citations: ["Reset password"] });
  });

  it("never returns another organization's conversations", async () => {
    const other = `org-other-${crypto.randomUUID()}`;
    await ensureOrganization(other);
    const theirs = await insertConversationWithTicket({ organizationId: other, channel: "widget" });
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, theirs.id));
    await say(theirs.id, "customer", "Secret question", [], 0);
    await say(theirs.id, "agent", "No article.", [], 1000);
    expect(await loadReviewItems(orgId)).toEqual([]);
  });
});
