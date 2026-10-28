import { Agent, run } from "@openai/agents";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { modelUnavailabilityReason } from "@/lib/env";
import { knowledgeBySection, withoutEmDashes } from "@/lib/agent";
import { cannedRepliesBlock } from "@/lib/canned-replies";
import { retrieveKnowledge } from "@/lib/retrieval";
import { citedTitles, groundedTitles } from "@/lib/citations";
import { INTERNAL_CONVERSATION_CHANNELS } from "@/lib/assistant-agent";

/**
 * A reply the manager can edit and send, written for the Inbox and the ticket page. It is its own small model call, not
 * a worker turn: nothing is stored, no ticket is raised and nobody is handed over, so asking for a draft changes nothing
 * until the manager sends it. It reads the same help articles and approved wording the worker does, and the manager's
 * own recent replies, so it sounds like the team.
 */

const TRANSCRIPT_TURNS = 12;
const TURN_CHARS = 700;
const STYLE_EXAMPLES = 5;
const STYLE_CHARS = 400;
const MAX_DRAFT_CHARS = 3900;

type Profile = Awaited<ReturnType<typeof import("@/lib/bootstrap").getOrCreateProfile>>;
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export type SuggestedReply =
  | {
      ok: true;
      body: string;
      /** The help articles the draft drew on. Empty when none matched, which the manager is told. */
      sources: string[];
      /** True when no article covered the question: the draft only asks or acknowledges, and needs a person's check. */
      needsCheck: boolean;
    }
  | { ok: false; reason: "no_model" | "no_customer_message" | "failed" };

function clip(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** The manager's own recent replies on this organization's customer conversations: how the team writes. */
async function recentManagerReplies(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ body: messages.body })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
        eq(messages.senderType, "manager"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(STYLE_EXAMPLES);
  return rows.map((row) => clip(row.body, STYLE_CHARS)).filter(Boolean);
}

export function draftInstructions(input: {
  workerName: string;
  managerName: string;
  organizationName: string;
  channel: string;
  role: string;
  knowledge: string;
  cannedWording: string;
  styleExamples: string[];
}): string {
  const email = input.channel === "email";
  return [
    `You write a draft reply for ${input.managerName}, a person on the ${input.organizationName} support team, to send to a customer. ${input.workerName} is the AI worker that normally answers; a person is writing now, so write as the team, in first person, and never mention being an AI or a draft.`,
    `The worker's role, for context on what this desk covers: ${clip(input.role, 600)}`,
    email
      ? "This is an email: a short greeting, the answer in a few sentences or steps, and a plain sign-off with the manager's first name."
      : "This is a chat: warm and brief, no greeting block, no sign-off.",
    "Use only the help articles below for facts, steps, names of buttons and policies. Never invent a feature, price, date, link or promise. If the articles do not cover what the customer asked, do not guess: acknowledge it, say you are checking, and ask the one question that would help. Start such a reply with the exact line [[CHECK]] on its own line.",
    `Answer what the customer is still waiting for. ${input.workerName} may already have answered part of it, or passed the question on to the team; in that case answer the customer's question yourself, and add only what is missing if it was already answered. Do not repeat what the conversation already told them. Plain text only, no headings, no tables. Never use an em dash.`,
    input.cannedWording,
    input.styleExamples.length > 0
      ? `How the team writes (their recent real replies; match the voice, not the content):\n${input.styleExamples.map((text) => `- ${text}`).join("\n")}`
      : "",
    input.knowledge ? `Help articles:\n\n${input.knowledge}` : "Help articles: none matched this message.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The model's text as a draft: the check marker is lifted off and turned into a flag. */
export function parseDraft(raw: string): { body: string; flaggedForCheck: boolean } {
  const flagged = /^\s*\[\[CHECK\]\]/i.test(raw);
  const body = withoutEmDashes(raw.replace(/\[\[CHECK\]\]/gi, "")).trim().slice(0, MAX_DRAFT_CHARS);
  return { body, flaggedForCheck: flagged };
}

export async function suggestReply(input: {
  organizationId: string;
  organizationName: string;
  profile: Profile;
  conversation: ConversationRow;
  /** The whole conversation, oldest first. */
  transcript: MessageRow[];
}): Promise<SuggestedReply> {
  if (modelUnavailabilityReason()) return { ok: false, reason: "no_model" };
  const lastCustomer = [...input.transcript].reverse().find((message) => message.senderType === "customer");
  if (!lastCustomer) return { ok: false, reason: "no_customer_message" };

  try {
    const { matches } = await retrieveKnowledge(input.profile, lastCustomer.body);
    const styleExamples = await recentManagerReplies(input.organizationId);
    const cannedWording = await cannedRepliesBlock(input.organizationId);
    const instructions = draftInstructions({
      workerName: input.profile.displayName,
      managerName: input.profile.managerName,
      organizationName: input.organizationName,
      channel: input.conversation.channel,
      role: input.profile.role,
      knowledge: matches.length > 0 ? knowledgeBySection(matches) : "",
      cannedWording,
      styleExamples,
    });
    const conversationText = input.transcript
      .slice(-TRANSCRIPT_TURNS)
      .map((message) => `${message.senderName}: ${clip(message.body, TURN_CHARS)}`)
      .join("\n");

    const drafter = new Agent({
      name: "Reply drafter",
      instructions,
      model: input.profile.model,
      modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
    });
    const prompt = `Conversation so far:\n${conversationText}\n\nWrite the reply to send to the customer now.`;
    // The model now and then answers with an empty message; one more try is enough, and a second blank is reported.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await run(drafter, prompt, { maxTurns: 1 });
      const raw = typeof result.finalOutput === "string" ? result.finalOutput : "";
      const { body, flaggedForCheck } = parseDraft(raw);
      if (body) {
        return {
          ok: true,
          body,
          sources: [...new Set([...citedTitles(body, matches), ...groundedTitles(body, matches)])],
          needsCheck: flaggedForCheck || matches.length === 0,
        };
      }
      console.warn("[suggested-reply] the model returned no usable text", { attempt, rawChars: raw.length, knowledgeMatches: matches.length });
    }
    return { ok: false, reason: "failed" };
  } catch (error) {
    console.warn("[suggested-reply] draft failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return { ok: false, reason: "failed" };
  }
}
