import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { evalCases } from "@/db/schema";
import { redactTicketText } from "@/lib/ticket-redaction";

/**
 * Saved test questions for one organization, made from review items: a question, what a good answer says, and whether
 * she should answer or hand over. They are what a change is measured against (lib/eval-replay.ts). Personal details are
 * removed before a case is saved, and a case is never read by another organization.
 */

export type EvalCase = typeof evalCases.$inferSelect;

export const EVAL_CASE_LIMITS = { question: 1500, reference: 2000, perOrganization: 100 } as const;

export const evalCaseCreateSchema = z.object({
  question: z.string().trim().min(3).max(EVAL_CASE_LIMITS.question),
  reference: z.string().trim().max(EVAL_CASE_LIMITS.reference).nullable().optional(),
  expectHandover: z.boolean().nullable().optional(),
  sourceItem: z.string().trim().max(120).nullable().optional(),
  sourceKind: z.enum(["bad_rating", "no_article", "team_answer", "manual"]).optional(),
});
export const evalCasePatchSchema = z.object({
  reference: z.string().trim().max(EVAL_CASE_LIMITS.reference).nullable().optional(),
  expectHandover: z.boolean().nullable().optional(),
  enabled: z.boolean().optional(),
});

/** What is saved: the text with names, emails, phone numbers, links and long numbers taken out. */
export function redactForCase(text: string, knownNames: string[] = []): string {
  return redactTicketText(text, knownNames).text;
}

/**
 * The expectation a review item suggests, for the manager to confirm or change: a correction or what the team said is
 * the reference; "should have handed over" and "handed over too soon" set the behaviour.
 */
export function suggestExpectation(item: { kind: string; reasons: string[]; correction: string | null; answer: string }): { reference: string | null; expectHandover: boolean | null } {
  const reasons = item.reasons.map((reason) => reason.toLowerCase());
  const reference = item.correction?.trim() || (item.kind === "team_answer" ? item.answer.trim() : null) || null;
  if (reasons.some((reason) => reason.includes("should have handed over"))) return { reference, expectHandover: true };
  if (reasons.some((reason) => reason.includes("handed over too soon"))) return { reference, expectHandover: false };
  return { reference, expectHandover: reference ? false : null };
}

export async function listEvalCases(organizationId: string): Promise<EvalCase[]> {
  return db.select().from(evalCases).where(eq(evalCases.organizationId, organizationId)).orderBy(desc(evalCases.createdAt));
}

export async function enabledEvalCases(organizationId: string): Promise<EvalCase[]> {
  return db.select().from(evalCases).where(and(eq(evalCases.organizationId, organizationId), eq(evalCases.enabled, true))).orderBy(asc(evalCases.createdAt));
}

export async function createEvalCase(
  organizationId: string,
  createdBy: string,
  input: z.infer<typeof evalCaseCreateSchema>,
): Promise<{ ok: true; evalCase: EvalCase } | { ok: false; status: number; error: string }> {
  if ((await listEvalCases(organizationId)).length >= EVAL_CASE_LIMITS.perOrganization) {
    return { ok: false, status: 409, error: `You can keep at most ${EVAL_CASE_LIMITS.perOrganization} test questions.` };
  }
  const question = redactForCase(input.question);
  const reference = input.reference ? redactForCase(input.reference) : null;
  if (question.length < 3) return { ok: false, status: 422, error: "That question has nothing left once personal details are removed." };
  if (reference === null && input.expectHandover == null) {
    return { ok: false, status: 422, error: "Say what a good answer is, or whether she should hand over, so the case can be scored." };
  }
  const [evalCase] = await db
    .insert(evalCases)
    .values({ organizationId, createdBy, question, reference, expectHandover: input.expectHandover ?? null, sourceItem: input.sourceItem ?? null, sourceKind: input.sourceKind ?? "manual" })
    .returning();
  return { ok: true, evalCase };
}

export async function updateEvalCase(organizationId: string, id: string, fields: z.infer<typeof evalCasePatchSchema>): Promise<EvalCase | null> {
  const set: Partial<typeof evalCases.$inferInsert> = {};
  if (fields.reference !== undefined) set.reference = fields.reference ? redactForCase(fields.reference) : null;
  if (fields.expectHandover !== undefined) set.expectHandover = fields.expectHandover;
  if (fields.enabled !== undefined) set.enabled = fields.enabled;
  if (Object.keys(set).length === 0) {
    const [same] = await db.select().from(evalCases).where(and(eq(evalCases.organizationId, organizationId), eq(evalCases.id, id))).limit(1);
    return same ?? null;
  }
  const [row] = await db.update(evalCases).set(set).where(and(eq(evalCases.organizationId, organizationId), eq(evalCases.id, id))).returning();
  return row ?? null;
}

export async function deleteEvalCase(organizationId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(evalCases).where(and(eq(evalCases.organizationId, organizationId), eq(evalCases.id, id))).returning({ id: evalCases.id });
  return deleted.length > 0;
}
