import { Agent, run } from "@openai/agents";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";
import { resolveTicketSchema, type TicketSchema } from "@/lib/ticket-schema";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";
import type { HistoryTurn } from "@/lib/conversation-memory";

/**
 * Sorts a customer conversation into the worker's own request types, tiers
 * and labels, so the Tickets queues work for customers with no helpdesk. It
 * only ever picks from the worker's lists (lib/ticket-schema.ts); a label the
 * model invents is dropped.
 *
 * With a helpdesk connected, the request type is chosen from the helpdesk's own
 * list (its request types), so a how-to question the worker answers itself
 * lands on the desk's "General Questions" rather than going unlabelled. When a
 * ticket is later raised, the helpdesk's actual type is what the page shows.
 *
 * It runs after the customer has their answer, so it never slows a reply, and
 * it never throws: a failed classification leaves the ticket as it was.
 */

const TRANSCRIPT_TURNS = 12;
const TURN_CHARS = 600;

const ClassificationSchema = z.object({
  requestType: z.string().nullable(),
  tier: z.string().nullable(),
  labels: z.array(z.string()),
});

export type Classification = { requestType: string | null; tier: string | null; labels: string[] };

function canonical(value: string | null, allowed: string[]): string | null {
  if (!value) return null;
  const wanted = value.trim().toLowerCase();
  return allowed.find((item) => item.toLowerCase() === wanted) ?? null;
}

/** Keeps only what the worker's lists allow, spelled the way the list spells it. */
export function validateClassification(raw: z.infer<typeof ClassificationSchema>, schema: TicketSchema, withRequestType: boolean): Classification {
  const labels = raw.labels
    .map((label) => canonical(label, schema.labels))
    .filter((label): label is string => Boolean(label));
  return {
    requestType: withRequestType ? canonical(raw.requestType, schema.requestTypes) : null,
    tier: canonical(raw.tier, schema.tiers),
    labels: [...new Set(labels)],
  };
}

function clip(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

export async function chooseClassification(args: {
  schema: TicketSchema;
  withRequestType: boolean;
  transcript: HistoryTurn[];
  handedOver: boolean;
}): Promise<Classification | null> {
  const { schema, withRequestType, transcript, handedOver } = args;
  const lines = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- (none: return an empty list)");

  const classifier = new Agent({
    name: "Ticket classifier",
    instructions:
      "You sort a customer support conversation into the support team's own categories. Choose only from the " +
      "lists below, copying each entry exactly. Never invent a category.\n\n" +
      (withRequestType
        ? `Request types (what the customer wants). A question about how to use the product, or a plain request for information, is a general question:\n${lines(schema.requestTypes)}\n\n`
        : "Leave requestType null: there is nothing to choose between.\n\n") +
      `Tiers, from the simplest to the hardest to resolve. Pick the level of support the customer's issue needs, ` +
      `not how polite or upset they are:\n${lines(schema.tiers)}\n\n` +
      `Labels (pick every one that clearly applies, or none):\n${lines(schema.labels)}\n\n` +
      (handedOver
        ? "The worker has handed this conversation to a person, so it needs more than a first-line answer."
        : "The worker is answering this itself so far."),
    model: guardrailModel(),
    outputType: ClassificationSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const text = transcript
    .slice(-TRANSCRIPT_TURNS)
    .map((turn) => `${turn.speaker}: ${clip(turn.body, TURN_CHARS)}`)
    .join("\n");

  try {
    const result = await run(classifier, `Conversation:\n${text}`, { maxTurns: 1 });
    const parsed = ClassificationSchema.safeParse(result.finalOutput);
    return parsed.success ? validateClassification(parsed.data, schema, withRequestType) : null;
  } catch {
    return null;
  }
}

type ConversationRow = typeof conversations.$inferSelect;

export type ClassifyResult =
  | { done: true; classification: Classification }
  | { done: false; reason: "manual" | "not_needed" | "no_model" | "failed" };

/**
 * Classifies a conversation when it has no tier yet, and again when it is first
 * handed over (a handover is the moment the tier usually changes). A person's
 * own edit is never overwritten.
 */
export async function classifyConversation(input: {
  organizationId: string;
  profile: { ticketSchema: Partial<TicketSchema> | null };
  conversation: Pick<ConversationRow, "id" | "tier" | "labels" | "classificationSource">;
  transcript: HistoryTurn[];
  /** True on the turn the conversation is first handed to a person. */
  handedOverNow: boolean;
}): Promise<ClassifyResult> {
  const { organizationId, profile, conversation, transcript, handedOverNow } = input;
  
  if (conversation.classificationSource === "manual") return { done: false, reason: "manual" };
  if (conversation.tier && !handedOverNow) return { done: false, reason: "not_needed" };
  if (modelUnavailabilityReason()) return { done: false, reason: "no_model" };

  // A helpdesk that can't be reached just means the worker's own request types are used.
  const helpdesk = await helpdeskBreakdownSource(organizationId).catch(() => null);
  const own = resolveTicketSchema(profile.ticketSchema);
  // A desk with several request types is the vocabulary; one that files everything
  // as a single issue type has nothing to choose between, so the request type stays unset.
  const deskTypes = helpdesk?.types ?? [];
  const schema = helpdesk ? { ...own, requestTypes: deskTypes } : own;
  const chosen = await chooseClassification({
    schema,
    withRequestType: !helpdesk || deskTypes.length > 1,
    transcript,
    handedOver: handedOverNow,
  });
  if (!chosen) return { done: false, reason: "failed" };

  await db
    .update(conversations)
    .set({
      ...(chosen.requestType ? { requestType: chosen.requestType } : {}),
      ...(chosen.tier ? { tier: chosen.tier } : {}),
      labels: [...new Set([...(conversation.labels ?? []), ...chosen.labels])],
      classificationSource: "worker",
    })
    .where(eq(conversations.id, conversation.id));
  return { done: true, classification: chosen };
}
