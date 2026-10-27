import { Agent, run } from "@openai/agents";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, evalRuns, messages } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";
import { enabledEvalCases, type EvalCase } from "@/lib/eval-cases";

/**
 * Replays an organization's saved test questions through the worker, as a customer would ask them, and scores the
 * answers. It uses the real pipeline (search, guardrails, the model) in dry-run mode, so nothing is emailed, routed or
 * ticketed, and each replay's conversation is removed when it is scored. The score is the share of cases that pass;
 * two scores are comparable when they ran on the same model (the run records it).
 */

export type CaseResult = {
  caseId: string;
  question: string;
  pass: boolean;
  handedOver: boolean;
  /** How closely the answer matches what a good answer says, 0 to 1; null when there was nothing to compare. */
  score: number | null;
  reason: string;
  reply: string;
  ms: number;
};

export const REPLAY_LIMITS = { maxCases: 40, concurrency: 3, caseTimeoutMs: 90_000, staleRunMs: 30 * 60 * 1000, passScore: 0.7 } as const;

const JudgeSchema = z.object({ score: z.number(), reason: z.string() });

/** How well a reply matches what a good answer says, 0 to 1, with a short reason. Null when it could not be judged. */
export async function judgeReply(input: { question: string; reference: string; reply: string }): Promise<{ score: number; reason: string } | null> {
  if (modelUnavailabilityReason()) return null;
  const judge = new Agent({
    name: "Answer judge",
    instructions:
      "You compare what a support assistant replied with what a good answer says. Score from 0 to 1: 1 when the reply gives the " +
      "same facts and steps (the wording may differ), about 0.5 when it is partly right or leaves out a main step, 0 when it " +
      "contradicts the good answer, gives different steps, or only hands the customer to a person. Do not reward length. " +
      "Give the score and one short sentence saying why.",
    model: guardrailModel(),
    outputType: JudgeSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  try {
    const result = await Promise.race([
      run(judge, `Question: ${input.question}\n\nA good answer says: ${input.reference}\n\nThe assistant replied: ${input.reply}`, { maxTurns: 1 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
    ]);
    if (!result) return null;
    const parsed = JudgeSchema.safeParse(result.finalOutput);
    return parsed.success ? { score: Math.min(1, Math.max(0, parsed.data.score)), reason: parsed.data.reason.slice(0, 300) } : null;
  } catch {
    return null;
  }
}

/** Whether a case passes, from what she did and how the answer was judged. Pure, so it can be tested without a model. */
export function verdictFor(
  evalCase: Pick<EvalCase, "reference" | "expectHandover">,
  outcome: { handedOver: boolean },
  judged: { score: number; reason: string } | null,
): { pass: boolean; score: number | null; reason: string } {
  if (evalCase.expectHandover === true) {
    return outcome.handedOver ? { pass: true, score: null, reason: "Handed over, as it should" } : { pass: false, score: null, reason: "Answered, but should have handed over" };
  }
  if (outcome.handedOver) return { pass: false, score: null, reason: "Handed over instead of answering" };
  if (!evalCase.reference) return { pass: true, score: null, reason: "Answered, as it should" };
  if (!judged) return { pass: false, score: null, reason: "The answer could not be scored" };
  return { pass: judged.score >= REPLAY_LIMITS.passScore, score: judged.score, reason: judged.reason };
}

async function replayOne(organizationId: string, profile: Awaited<ReturnType<typeof getOrCreateProfile>>, evalCase: EvalCase): Promise<CaseResult> {
  const started = Date.now();
  const conversation = await insertConversationWithTicket({ organizationId, channel: "eval", subject: evalCase.question.slice(0, 120), customerName: "Replay" });
  try {
    const [userMessage] = await db.insert(messages).values({ conversationId: conversation.id, senderType: "customer", senderName: "Replay", body: evalCase.question }).returning();
    const turn = await Promise.race([
      runCustomerTurn({ organizationId, profile, conversation, priorMessages: [], userMessage, speakerName: "Replay", dryRun: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), REPLAY_LIMITS.caseTimeoutMs)),
    ]);
    const handedOver = Boolean(turn.result.escalate);
    const reply = turn.reply.body;
    const judged = evalCase.reference && !handedOver && evalCase.expectHandover !== true ? await judgeReply({ question: evalCase.question, reference: evalCase.reference, reply }) : null;
    const verdict = verdictFor(evalCase, { handedOver }, judged);
    return { caseId: evalCase.id, question: evalCase.question, handedOver, reply: reply.slice(0, 1500), ms: Date.now() - started, ...verdict };
  } catch (error) {
    return { caseId: evalCase.id, question: evalCase.question, pass: false, handedOver: false, score: null, reason: error instanceof Error ? `Could not run: ${error.message}` : "Could not run", reply: "", ms: Date.now() - started };
  } finally {
    await db.delete(conversations).where(eq(conversations.id, conversation.id)).catch(() => undefined);
  }
}

/** Runs a started run to the end, updating its row as each case finishes. Never throws. */
export async function executeRun(runId: string): Promise<void> {
  try {
    const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1);
    if (!row) return;
    const cases = (await enabledEvalCases(row.organizationId)).slice(0, REPLAY_LIMITS.maxCases);
    const profile = await getOrCreateProfile(row.organizationId);
    const results: CaseResult[] = [];
    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const evalCase = cases[next++];
        results.push(await replayOne(row.organizationId, profile, evalCase));
        await db.update(evalRuns).set({ results, passed: results.filter((r) => r.pass).length }).where(eq(evalRuns.id, runId));
      }
    };
    await Promise.all(Array.from({ length: Math.min(REPLAY_LIMITS.concurrency, cases.length) }, worker));
    const passed = results.filter((r) => r.pass).length;
    await db
      .update(evalRuns)
      .set({ status: "done", results, passed, total: cases.length, score: cases.length ? passed / cases.length : null, finishedAt: new Date() })
      .where(eq(evalRuns.id, runId));
  } catch (error) {
    await db.update(evalRuns).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "Failed", finishedAt: new Date() }).where(eq(evalRuns.id, runId)).catch(() => undefined);
  }
}

export type StartResult = { ok: true; runId: string } | { ok: false; status: number; error: string };

/** Starts a replay of every enabled test case and returns at once; the run row fills in as it goes. */
export async function startReplay(input: { organizationId: string; triggeredBy: string; changeId?: string | null; awaitFinish?: boolean }): Promise<StartResult> {
  const unavailable = modelUnavailabilityReason();
  if (unavailable) return { ok: false, status: 503, error: "The AI model is not available, so a replay cannot run." };
  // A run that has been "running" for far too long died with its server; it no longer blocks a new one.
  await db
    .update(evalRuns)
    .set({ status: "failed", error: "Stopped: the server restarted", finishedAt: new Date() })
    .where(and(eq(evalRuns.organizationId, input.organizationId), eq(evalRuns.status, "running"), lt(evalRuns.startedAt, new Date(Date.now() - REPLAY_LIMITS.staleRunMs))));
  const [running] = await db.select({ id: evalRuns.id }).from(evalRuns).where(and(eq(evalRuns.organizationId, input.organizationId), eq(evalRuns.status, "running"))).limit(1);
  if (running) return { ok: false, status: 409, error: "A replay is already running." };
  const cases = await enabledEvalCases(input.organizationId);
  if (cases.length === 0) return { ok: false, status: 422, error: "There are no test cases to replay yet." };
  const profile = await getOrCreateProfile(input.organizationId);
  const [created] = await db
    .insert(evalRuns)
    .values({
      organizationId: input.organizationId,
      total: Math.min(cases.length, REPLAY_LIMITS.maxCases),
      context: { model: profile.model, release: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
      changeId: input.changeId ?? null,
      triggeredBy: input.triggeredBy,
    })
    .returning();
  const finish = executeRun(created.id);
  if (input.awaitFinish) await finish;
  else void finish;
  return { ok: true, runId: created.id };
}

export async function listEvalRuns(organizationId: string, limit = 10) {
  return db.select().from(evalRuns).where(eq(evalRuns.organizationId, organizationId)).orderBy(desc(evalRuns.startedAt)).limit(limit);
}

export async function getEvalRun(organizationId: string, id: string) {
  const [row] = await db.select().from(evalRuns).where(and(eq(evalRuns.organizationId, organizationId), eq(evalRuns.id, id))).limit(1);
  return row ?? null;
}
