import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolApprovals } from "@/db/schema";

export type ToolApproval = typeof toolApprovals.$inferSelect;

export type CreatePendingApprovalInput = {
  organizationId: string;
  toolId: string;
  input: Record<string, unknown>;
};

export async function createPendingApproval(entry: CreatePendingApprovalInput): Promise<ToolApproval> {
  const [row] = await db
    .insert(toolApprovals)
    .values({
      organizationId: entry.organizationId,
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

export async function listPendingApprovals(organizationId: string): Promise<ToolApproval[]> {
  return db
    .select()
    .from(toolApprovals)
    .where(and(eq(toolApprovals.organizationId, organizationId), eq(toolApprovals.status, "pending")))
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
