import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { answerFeedback, conversations, messages } from "@/db/schema";
import { searchKeywords } from "@/lib/tools-integrations/atlassian";
import { FEEDBACK_REASON_LABELS, type FeedbackReason } from "@/lib/answer-feedback";

/**
 * What a manager should look at to make the worker better, gathered from what already happened: replies rated bad,
 * questions handed over with no article behind them, and what the team actually said after a handoff. Read-only: it
 * proposes nothing and changes nothing. The questions are customers' own words, so it is for managers only, like the Inbox.
 */

export type ReviewKind = "bad_rating" | "no_article" | "team_answer";

export type ReviewItem = {
  id: string;
  kind: ReviewKind;
  conversationId: string;
  ticketNumber: number;
  /** What the customer asked. */
  question: string;
  /** What the worker said (bad_rating, no_article), or what the team said (team_answer). */
  answer: string;
  citations: string[];
  reasons: string[];
  /** What the manager said it should have been. */
  correction: string | null;
  at: string;
};

export type ReviewGroup = {
  /** A few of the words the questions share. */
  topic: string;
  count: number;
  kinds: Record<ReviewKind, number>;
  latest: string;
  items: ReviewItem[];
};

const WINDOW_DAYS = 60;
const CONVERSATION_CAP = 300;
const SIMILARITY = 0.5;

function keywordSet(text: string): Set<string> {
  return new Set(searchKeywords(text).map((word) => word.slice(0, Math.max(4, word.length - 3))));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/** Puts items about the same thing together, biggest group first, so a manager fixes causes, not single chats. */
export function groupReviewItems(items: ReviewItem[]): ReviewGroup[] {
  const groups: { words: Set<string>; group: ReviewGroup }[] = [];
  for (const item of [...items].sort((a, b) => b.at.localeCompare(a.at))) {
    const words = keywordSet(item.question);
    const home = groups.find((entry) => similarity(entry.words, words) >= SIMILARITY);
    if (home) {
      home.group.items.push(item);
      home.group.count += 1;
      home.group.kinds[item.kind] += 1;
      for (const word of words) home.words.add(word);
    } else {
      groups.push({
        words: new Set(words),
        group: {
          topic: searchKeywords(item.question).slice(0, 4).join(" ") || item.question.slice(0, 40),
          count: 1,
          kinds: { bad_rating: 0, no_article: 0, team_answer: 0, [item.kind]: 1 } as Record<ReviewKind, number>,
          latest: item.at,
          items: [item],
        },
      });
    }
  }
  return groups.map((entry) => entry.group).sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
}

type Row = typeof messages.$inferSelect;

export async function loadReviewItems(organizationId: string, now = new Date()): Promise<ReviewItem[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const items: ReviewItem[] = [];

  const rated = await db
    .select({ feedback: answerFeedback, answer: messages, ticketNumber: conversations.ticketNumber })
    .from(answerFeedback)
    .innerJoin(messages, eq(messages.id, answerFeedback.messageId))
    .innerJoin(conversations, eq(conversations.id, answerFeedback.conversationId))
    .where(and(eq(answerFeedback.organizationId, organizationId), eq(answerFeedback.rating, "bad"), gte(answerFeedback.updatedAt, since)))
    .orderBy(desc(answerFeedback.updatedAt))
    .limit(CONVERSATION_CAP);

  const handedOver = await db
    .select({ id: conversations.id, ticketNumber: conversations.ticketNumber, status: conversations.status, ticket: conversations.externalTicketKey })
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), ne(conversations.channel, "assistant"), gte(conversations.updatedAt, since)))
    .orderBy(desc(conversations.updatedAt))
    .limit(CONVERSATION_CAP);

  const ids = [...new Set([...rated.map((row) => row.feedback.conversationId), ...handedOver.map((row) => row.id)])];
  if (ids.length === 0) return items;
  const thread = await db.select().from(messages).where(inArray(messages.conversationId, ids));
  const byConversation = new Map<string, Row[]>();
  for (const message of thread) byConversation.set(message.conversationId, [...(byConversation.get(message.conversationId) ?? []), message]);
  for (const list of byConversation.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  /** The customer's last message before this one. */
  const questionBefore = (conversationId: string, at: Date): string | null => {
    const list = byConversation.get(conversationId) ?? [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].createdAt.getTime() <= at.getTime() && list[i].senderType === "customer") return list[i].body;
    }
    return null;
  };

  for (const row of rated) {
    const question = questionBefore(row.feedback.conversationId, row.answer.createdAt);
    if (!question) continue;
    items.push({
      id: `rating:${row.feedback.id}`,
      kind: "bad_rating",
      conversationId: row.feedback.conversationId,
      ticketNumber: row.ticketNumber,
      question,
      answer: row.answer.body,
      citations: row.answer.citations ?? [],
      reasons: (row.feedback.reasons ?? []).map((reason) => FEEDBACK_REASON_LABELS[reason as FeedbackReason] ?? reason),
      correction: row.feedback.correction,
      at: row.feedback.updatedAt.toISOString(),
    });
  }

  for (const conversation of handedOver) {
    const list = byConversation.get(conversation.id) ?? [];
    const wasHandedOver = conversation.status === "needs_human" || Boolean(conversation.ticket) || list.some((message) => message.senderType === "manager");
    if (!wasHandedOver) continue;
    const firstAgent = list.find((message) => message.senderType === "agent");
    if (firstAgent && (firstAgent.citations ?? []).length === 0) {
      const question = questionBefore(conversation.id, firstAgent.createdAt);
      if (question) {
        items.push({
          id: `noarticle:${firstAgent.id}`,
          kind: "no_article",
          conversationId: conversation.id,
          ticketNumber: conversation.ticketNumber,
          question,
          answer: firstAgent.body,
          citations: [],
          reasons: [],
          correction: null,
          at: firstAgent.createdAt.toISOString(),
        });
      }
    }
    for (const message of list) {
      if (message.senderType !== "manager") continue;
      const question = questionBefore(conversation.id, message.createdAt);
      if (!question) continue;
      items.push({
        id: `team:${message.id}`,
        kind: "team_answer",
        conversationId: conversation.id,
        ticketNumber: conversation.ticketNumber,
        question,
        answer: message.body,
        citations: [],
        reasons: [],
        correction: null,
        at: message.createdAt.toISOString(),
      });
    }
  }
  return items;
}
