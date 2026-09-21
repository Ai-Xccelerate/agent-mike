import { and, desc, eq } from "drizzle-orm";
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
