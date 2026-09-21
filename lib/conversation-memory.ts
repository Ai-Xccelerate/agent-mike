import { Agent, run } from "@openai/agents";
import { modelUnavailabilityReason } from "@/lib/env";

/**
 * Shared multi-turn memory for customer chat and the admin Assistant.
 *
 * Recent turns are replayed verbatim; anything older than the window is folded
 * into `conversations.summary` with a count watermark so long threads do not
 * grow the model input forever.
 */

/**
 * How many of the most recent messages get replayed verbatim on every turn.
 * Smaller than Jules' 80-message window — easy to raise if real usage wants more.
 */
export const REPLAY_MESSAGE_LIMIT = 20;

/** One prior turn, with the speaker label already resolved for the transcript. */
export type HistoryTurn = {
  speaker: string;
  body: string;
};

export type ConversationSummaryState = {
  summary: string | null;
  summarizedMessageCount: number;
};

export type SummaryAudience = "assistant" | "customer";

/**
 * Fold prior turns (and an optional rolling summary) into the model input as
 * plain text. Empty history keeps the bare current message so a first turn
 * stays unchanged from the pre-memory behaviour.
 */
export function buildInputWithHistory(
  history: HistoryTurn[],
  message: string,
  currentSpeaker: string,
  summary: string | null,
): string {
  const summaryBlock = summary ? `Summary of earlier parts of this conversation:\n${summary}\n\n` : "";
  if (history.length === 0) return summaryBlock + message;
  const transcript = history.map((turn) => `${turn.speaker}: ${turn.body}`).join("\n");
  return `${summaryBlock}Earlier in this conversation:\n${transcript}\n\n${currentSpeaker}: ${message}`;
}

function summarizerInstructions(audience: SummaryAudience): string {
  if (audience === "assistant") {
    return (
      "Merge the existing summary (if any) with the new messages into one updated summary of this " +
      "conversation between an admin assistant and a manager. Be factual and concise - a few sentences " +
      "to a short paragraph. Preserve specific facts (ticket numbers, names, decisions) a later turn " +
      "might need; drop pleasantries."
    );
  }
  return (
    "Merge the existing summary (if any) with the new messages into one updated summary of this " +
    "customer support conversation. Be factual and concise - a few sentences to a short paragraph. " +
    "Preserve product names, account details, decisions, open questions, and escalation reasons a " +
    "later turn might need; drop pleasantries."
  );
}

/**
 * Rolling summarization: once a conversation has more messages than the
 * replay window, fold the newly-old batch into the existing summary and
 * advance the watermark. A failed or unavailable model call leaves state
 * unchanged — the replay window still bounds cost.
 */
export async function maybeRefreshConversationSummary(
  profile: { model: string },
  current: ConversationSummaryState,
  allMessages: HistoryTurn[],
  audience: SummaryAudience,
): Promise<ConversationSummaryState> {
  const newBoundary = allMessages.length - REPLAY_MESSAGE_LIMIT;
  if (newBoundary <= current.summarizedMessageCount) return current;
  if (modelUnavailabilityReason()) return current;

  const batch = allMessages.slice(current.summarizedMessageCount, newBoundary);
  const batchText = batch.map((m) => `${m.speaker}: ${m.body}`).join("\n");

  const summarizer = new Agent({
    name:
      audience === "assistant"
        ? "Assistant conversation summarizer"
        : "Customer conversation summarizer",
    instructions: summarizerInstructions(audience),
    model: profile.model,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const input = current.summary
    ? `Existing summary:\n${current.summary}\n\nNew messages to fold in:\n${batchText}`
    : `Messages to summarize:\n${batchText}`;

  try {
    const result = await run(summarizer, input, { maxTurns: 1 });
    const text = typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? "");
    if (!text.trim()) return current;
    return { summary: text.trim(), summarizedMessageCount: newBoundary };
  } catch {
    return current;
  }
}
