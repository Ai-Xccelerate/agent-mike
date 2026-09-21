import { logToolCall, type ToolCallLogEntry } from "@/lib/tools-integrations/tool-call-log";

const TOOL_LOG_RESULT_MAX = 1500;

export function toolLogOutput(result: string): Record<string, unknown> {
  if (result.length <= TOOL_LOG_RESULT_MAX) return { result };
  return { result: `${result.slice(0, TOOL_LOG_RESULT_MAX)}…`, truncated: true, length: result.length };
}

async function logToolCallSafely(entry: ToolCallLogEntry): Promise<void> {
  try {
    await logToolCall(entry);
  } catch {
    // Observability must not fail the tool the customer or manager just invoked.
  }
}

/**
 * Run a skill / Assistant write tool and persist a toolCalls row. Callers that
 * return an error string (instead of throwing) can mark the row via `errorIf`.
 */
export async function logAndRunTool(
  entry: Omit<ToolCallLogEntry, "status" | "output" | "errorMessage">,
  run: () => Promise<string>,
  options?: { errorIf?: (text: string) => string | null },
): Promise<string> {
  try {
    const result = await run();
    const errorMessage = options?.errorIf?.(result) ?? null;
    await logToolCallSafely({
      ...entry,
      output: toolLogOutput(result),
      status: errorMessage ? "error" : "success",
      errorMessage,
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToolCallSafely({
      ...entry,
      output: null,
      status: "error",
      errorMessage,
    });
    throw error;
  }
}
