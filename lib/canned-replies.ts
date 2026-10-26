import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { cannedReplies } from "@/db/schema";

export type CannedReply = typeof cannedReplies.$inferSelect;

export const CANNED_LIMITS = { title: 120, situation: 400, reply: 1200, perOrganization: 40, inPrompt: 12, promptChars: 6000 } as const;

export const cannedReplyCreateSchema = z.object({
  title: z.string().trim().min(1).max(CANNED_LIMITS.title),
  situation: z.string().trim().min(1).max(CANNED_LIMITS.situation),
  reply: z.string().trim().min(1).max(CANNED_LIMITS.reply),
  enabled: z.boolean().optional(),
});
export const cannedReplyPatchSchema = cannedReplyCreateSchema.partial();

export async function listCannedReplies(organizationId: string): Promise<CannedReply[]> {
  return db.select().from(cannedReplies).where(eq(cannedReplies.organizationId, organizationId)).orderBy(asc(cannedReplies.createdAt));
}

export async function createCannedReply(organizationId: string, input: z.infer<typeof cannedReplyCreateSchema>): Promise<CannedReply | null> {
  if ((await listCannedReplies(organizationId)).length >= CANNED_LIMITS.perOrganization) return null;
  const [row] = await db.insert(cannedReplies).values({ organizationId, ...input }).returning();
  return row;
}

export async function updateCannedReply(organizationId: string, id: string, fields: z.infer<typeof cannedReplyPatchSchema>): Promise<CannedReply | null> {
  const [row] = await db
    .update(cannedReplies)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(cannedReplies.organizationId, organizationId), eq(cannedReplies.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteCannedReply(organizationId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(cannedReplies).where(and(eq(cannedReplies.organizationId, organizationId), eq(cannedReplies.id, id))).returning({ id: cannedReplies.id });
  return deleted.length > 0;
}

/**
 * The paragraph of approved wording for the worker's instructions, or "" when there is none. Only what a manager has
 * switched on, capped so a long list cannot crowd out the rest of the prompt. It changes only when a manager edits the
 * page, so it sits in the fixed part of the prompt.
 */
export async function cannedRepliesBlock(organizationId: string): Promise<string> {
  const rows = (await listCannedReplies(organizationId)).filter((row) => row.enabled).slice(0, CANNED_LIMITS.inPrompt);
  const lines: string[] = [];
  let used = 0;
  for (const row of rows) {
    const line = `- When: ${row.situation}\n  Say: ${row.reply}`;
    if (used + line.length > CANNED_LIMITS.promptChars) break;
    used += line.length;
    lines.push(line);
  }
  if (lines.length === 0) return "";
  return (
    "Approved wording from the team, for situations that come up again and again. When a customer's message matches one of " +
    "these situations, lead with what it says, in a chat voice and fitted to what they wrote (use their details, drop what " +
    "does not apply). It wins over the reference material below when both cover the question: do not replace it with a " +
    "different answer, and add steps from the material only if the customer needs more than the reply gives. Never invent " +
    "facts it does not contain, and do not use a reply for a situation it does not fit:\n" +
    lines.join("\n") +
    "\n\n"
  );
}
