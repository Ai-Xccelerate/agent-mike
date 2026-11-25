import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";
import { asksForTicketOrPerson } from "@/lib/guardrails";
import type { KnowledgeMatch } from "@/lib/knowledge";
import type { HistoryTurn } from "@/lib/conversation-memory";

/**
 * A second look at a handover, before the customer is told a person is coming.
 *
 * The worker sometimes hands over although the pages she was given already answer the question (the reply check never
 * sees the pages, only whether any were found), and sometimes hands over at once on a problem where one short question
 * (which product, the exact error, what was tried) would let a teammate start without asking it again. This check
 * runs only on a draft that hands over, so a normal answer never pays for it, and it returns one of three verdicts:
 *
 *   covered       the pages answer it: write the answer from them
 *   needs_scoping the pages do not, and the details a teammate needs are missing: ask one short question first
 *   handover      the handover stands (a person is needed, it is urgent, or nothing more is worth asking)
 *
 * It never fires for a customer who asked for a person or a ticket, a conversation already with the team, or a message
 * that holds one of the organization's escalation terms: those handovers are the customer's or the policy's call.
 */

export type HandoverVerdict = "covered" | "needs_scoping" | "handover";

const VerdictSchema = z.object({
  verdict: z.enum(["covered", "needs_scoping", "handover"]),
  reason: z.string(),
});

export type HandoverCheckInput = {
  /** The customer's latest message. */
  message: string;
  /** The conversation so far. */
  history: HistoryTurn[];
  /** The name the worker's own turns carry in the history. */
  workerName: string;
  /** The sections the worker was given. */
  sections: KnowledgeMatch[];
  escalationTerms: string[];
  withTeam: boolean;
  role: string;
};

/** Whether the check should run at all: only for a plain handover (the tag, or a reply that promises a person) the customer did not ask for. */
export function handoverNeedsCheck(handsOver: boolean, input: Pick<HandoverCheckInput, "message" | "escalationTerms" | "withTeam">): boolean {
  if (!handsOver) return false;
  if (input.withTeam) return false;
  if (asksForTicketOrPerson(input.message)) return false;
  const lowered = input.message.toLowerCase();
  if (input.escalationTerms.some((term) => term && lowered.includes(term.toLowerCase()))) return false;
  return true;
}

/** The worker has already put a question to this customer: one scoping question per conversation is the limit. */
export function workerAlreadyAsked(history: HistoryTurn[], workerName: string): boolean {
  return history.some((turn) => turn.speaker === workerName && /\?\s*$/.test(turn.body.replace(/\[\[[^\]]*\]\]/g, "").trim()));
}

function sectionsText(sections: KnowledgeMatch[]): string {
  return sections
    .slice(0, 8)
    .map((section) => `## ${section.title}${section.heading ? ` > ${section.heading}` : ""}\n${section.content.slice(0, 700)}`)
    .join("\n\n")
    .slice(0, 6500);
}

const INSTRUCTIONS =
  "You check a support assistant that is about to hand a customer's chat to a person. You get the conversation, the help-article " +
  "sections the assistant was given, and the customer's latest message. Choose one verdict:\n" +
  "- covered: the sections already contain the steps or facts that answer the customer's question, even if only in part. The assistant should answer from them.\n" +
  "- needs_scoping: the sections do not answer it, the issue is not urgent, a person is not needed whatever the pages say, and the assistant has not yet learned " +
  "something a teammate would have to ask next (which product or version, the exact error message, what the customer already tried). One short question would help.\n" +
  "- handover: the handover stands. Choose this when a person is needed whatever the pages say (contract, pricing, account or access changes, custom work, training), " +
  "when it is urgent or affects many people (an outage), when the customer already gave the details and the documented steps did not work, or when nothing useful is left to ask.\n" +
  "Reply with the verdict and a one-sentence reason.";

export async function judgeHandover(input: HandoverCheckInput): Promise<HandoverVerdict> {
  if (modelUnavailabilityReason()) return "handover";
  const recent = input.history
    .slice(-6)
    .map((turn) => `${turn.speaker}: ${turn.body}`)
    .join("\n");
  const judge = new Agent({
    name: "Handover check",
    instructions: INSTRUCTIONS,
    model: guardrailModel(),
    outputType: VerdictSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  try {
    const result = await run(
      judge,
      `Assistant role: ${input.role}\n\nConversation so far:\n${recent || "(none)"}\n\nCustomer's latest message: ${input.message}\n\nSections the assistant was given:\n${sectionsText(input.sections) || "(none)"}`,
      { maxTurns: 1 },
    );
    const parsed = VerdictSchema.safeParse(result.finalOutput);
    return parsed.success ? parsed.data.verdict : "handover";
  } catch {
    // Any trouble leaves the handover as it was: this check can only make a handover better, never block one.
    return "handover";
  }
}

/** The verdict for a draft that hands over, or null when no check applies. A second scoping question is never asked. */
export async function decideHandover(
  handsOver: boolean,
  input: HandoverCheckInput,
  judge: (input: HandoverCheckInput) => Promise<HandoverVerdict> = judgeHandover,
): Promise<HandoverVerdict | null> {
  if (!handoverNeedsCheck(handsOver, input)) return null;
  const verdict = await judge(input);
  if (verdict === "needs_scoping" && workerAlreadyAsked(input.history, input.workerName)) return "handover";
  return verdict;
}

export const COVERED_RETRY_MESSAGE =
  "Reviewer note: the reference material you were given already covers this question. Do not hand over. Answer from it: give the steps or facts it contains, " +
  "and say plainly what it does not cover. Hand over only if, after reading it again, it truly holds nothing that helps.";

export const SCOPING_RETRY_MESSAGE =
  "Reviewer note: do not hand over yet, and do not use [[ESCALATE]]. Ask the customer ONE short question that a teammate would otherwise have to ask next: " +
  "which product or version they use, the exact error message, or what they already tried. Ask only what you do not already know from this conversation. " +
  "Say nothing else about handing over.";
