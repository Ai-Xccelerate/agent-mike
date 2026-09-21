import { db } from "@/lib/db";
import { toolCalls } from "@/db/schema";

export type ToolCallLogStatus = "success" | "error" | "escalated";

export type ToolCallLogEntry = {
  organizationId: string;
  toolId: string;
  calledBy?: string | null;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status: ToolCallLogStatus;
  errorMessage?: string | null;
};

export async function logToolCall(entry: ToolCallLogEntry): Promise<void> {
  await db.insert(toolCalls).values({
    organizationId: entry.organizationId,
    toolId: entry.toolId,
    calledBy: entry.calledBy ?? null,
    input: entry.input,
    output: entry.output ?? null,
    status: entry.status,
    errorMessage: entry.errorMessage ?? null,
  });
}
