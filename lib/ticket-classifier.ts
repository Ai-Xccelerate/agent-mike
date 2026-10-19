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
  summary: z.string(),
});

export type Classification = {
  requestType: string | null;
  tier: string | null;
  labels: string[];
  summary: string | null;
};

function canonical(value: string | null, allowed: string[]): string | null {
  if (!value) return null;
  const wanted = value.trim().toLowerCase();
  return allowed.find((item) => item.toLowerCase() === wanted) ?? null;
}

/** Keeps only what the worker's lists allow, spelled the way the list spells it. */
export function validateClassification(
  raw: Omit<z.infer<typeof ClassificationSchema>, "summary"> & { summary?: string },
  schema: TicketSchema,
  withRequestType: boolean,
): Classification {
  const labels = raw.labels
    .map((label) => canonical(label, schema.labels))
    .filter((label): label is string => Boolean(label));
  return {
    requestType: withRequestType
      ? canonical(raw.requestType, schema.requestTypes)
      : null,
    tier: canonical(raw.tier, schema.tiers),
    labels: [...new Set(labels)],
    summary: (raw.summary ?? "").trim().slice(0, 600) || null,
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
  const lines = (items: string[]) =>
    items.length
      ? items.map((item) => `- ${item}`).join("\n")
      : "- (none: return an empty list)";

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
      "Summary: one to three plain sentences for the person who picks this ticket up. Say who the customer is (if known), " +
      "what they need, the product, and anything already tried. No greeting, no field list, never write 'not given'; " +
      "leave out what the customer did not say.\n\n" +
      (handedOver
        ? "The worker has handed this conversation to a person, so it needs more than a first-line answer."
        : "The worker is answering this itself so far."),
    model: guardrailModel(),
    outputType: ClassificationSchema,
    modelSettings: {
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
    },
  });

  const text = transcript
    .slice(-TRANSCRIPT_TURNS)
    .map((turn) => `${turn.speaker}: ${clip(turn.body, TURN_CHARS)}`)
    .join("\n");

  try {
    const result = await run(classifier, `Conversation:\n${text}`, {
      maxTurns: 1,
    });
    const parsed = ClassificationSchema.extend({ summary: z.string().default("") }).safeParse(result.finalOutput);
    return parsed.success
      ? validateClassification(parsed.data, schema, withRequestType)
      : null;
  } catch {
    return null;
  }
}

const SUMMARY_WAIT_MS = 8000;
const SUMMARY_INSTRUCTIONS =
  "Write one to three plain sentences for the person who picks up this support ticket. Say who the customer is " +
  "(if known), what they need, the product, and anything already tried. No greeting, no field list, never write " +
  "'not given'; leave out what the customer did not say.";

/**
 * A short summary for a ticket that is about to be handed over, so it can go on
 * the helpdesk ticket as well as the Tickets page. Gives up after a few seconds
 * and never throws: the handoff goes ahead without it.
 */
export async function summarizeForHandoff(transcript: HistoryTurn[]): Promise<string | null> {
  if (modelUnavailabilityReason()) return null;
  const text = transcript
    .slice(-TRANSCRIPT_TURNS)
    .map((turn) => `${turn.speaker}: ${clip(turn.body, TURN_CHARS)}`)
    .join("\n");
  const summarizer = new Agent({
    name: "Ticket summarizer",
    instructions: SUMMARY_INSTRUCTIONS,
    model: guardrailModel(),
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SUMMARY_WAIT_MS));
  try {
    const result = await Promise.race([run(summarizer, `Conversation:\n${text}`, { maxTurns: 1 }), timeout]);
    const out = result && typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
    return out ? out.slice(0, 600) : null;
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
  conversation: Pick<
    ConversationRow,
    "id" | "tier" | "labels" | "classificationSource" | "ticketSummary"
  >;
  transcript: HistoryTurn[];
  /** True on the turn the conversation is first handed to a person. */
  handedOverNow: boolean;
}): Promise<ClassifyResult> {
  const { organizationId, profile, conversation, transcript, handedOverNow } =
    input;

  const manual = conversation.classificationSource === "manual";
  const needsSummary = !conversation.ticketSummary || handedOverNow;
  // A person's own classification is never overwritten, but the summary is not theirs.
  if (manual && !needsSummary) return { done: false, reason: "manual" };
  if (conversation.tier && !needsSummary)
    return { done: false, reason: "not_needed" };
  if (modelUnavailabilityReason()) return { done: false, reason: "no_model" };

  // A helpdesk that can't be reached just means the worker's own request types are used.
  const helpdesk = await helpdeskBreakdownSource(organizationId).catch(
    () => null,
  );
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
  if (manual && !chosen.summary) return { done: false, reason: "manual" };

  await db
    .update(conversations)
    .set({
      ...(chosen.summary ? { ticketSummary: chosen.summary } : {}),
      ...(manual
        ? {}
        : {
            ...(chosen.requestType ? { requestType: chosen.requestType } : {}),
            ...(chosen.tier ? { tier: chosen.tier } : {}),
            labels: [
              ...new Set([...(conversation.labels ?? []), ...chosen.labels]),
            ],
            classificationSource: "worker",
          }),
    })
    .where(eq(conversations.id, conversation.id));
  return { done: true, classification: chosen };
}
