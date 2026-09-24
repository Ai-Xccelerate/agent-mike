import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolApprovals } from "@/db/schema";

export type ToolApproval = typeof toolApprovals.$inferSelect;

export type CreatePendingApprovalInput = {
  organizationId: string;
  toolId: string;
  input: Record<string, unknown>;
  conversationId?: string | null;
};

export async function createPendingApproval(entry: CreatePendingApprovalInput): Promise<ToolApproval> {
  const [row] = await db
    .insert(toolApprovals)
    .values({
      organizationId: entry.organizationId,
      conversationId: entry.conversationId ?? null,
      toolId: entry.toolId,
      input: entry.input,
      status: "pending",
    })
    .returning();
  return row;
}

export async function getApproval(id: string): Promise<ToolApproval | null> {
  const [row] = await db.select().from(toolApprovals).where(eq(toolApprovals.id, id)).limit(1);
  return row ?? null;
}

/**
 * Scoped to one conversation whenever the caller has one - two assistant
 * threads must never see or resolve each other's pending proposals. A null
 * conversationId falls back to the old org-wide lookup for callers that
 * genuinely have none.
 */
export async function listPendingApprovals(
  organizationId: string,
  conversationId?: string | null,
): Promise<ToolApproval[]> {
  const conditions = [eq(toolApprovals.organizationId, organizationId), eq(toolApprovals.status, "pending")];
  if (conversationId) conditions.push(eq(toolApprovals.conversationId, conversationId));
  return db
    .select()
    .from(toolApprovals)
    .where(and(...conditions))
    .orderBy(desc(toolApprovals.createdAt));
}

export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
): Promise<ToolApproval> {
  const [row] = await db
    .update(toolApprovals)
    .set({
      status: decision,
      decidedBy,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(toolApprovals.id, id), eq(toolApprovals.status, "pending")))
    .returning();

  if (!row) {
    throw new Error("Approval is not pending and cannot be decided again");
  }
  return row;
}

export async function recordApprovalResult(
  id: string,
  result: Record<string, unknown> | null,
  errorMessage: string | null,
): Promise<void> {
  await db
    .update(toolApprovals)
    .set({
      result,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(toolApprovals.id, id));
}

/**
 * Retires pending proposals without applying them - used when a newer
 * proposal replaces them, or they've sat unconfirmed too long - so a later
 * "yes" can only ever apply what the manager was most recently shown.
 * `reason` lands in decidedBy (e.g. "system:superseded") to keep these
 * distinguishable from a manager's own rejection.
 */
export async function retirePendingApprovals(ids: string[], reason: string): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(toolApprovals)
    .set({ status: "rejected", decidedBy: reason, decidedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(toolApprovals.id, ids), eq(toolApprovals.status, "pending")));
}
