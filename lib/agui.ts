/**
 * Helpers shared by the AG-UI routes (https://docs.ag-ui.com): the admin
 * Assistant's and the customer chat's.
 */

export type RunAgentInput = {
  threadId?: unknown;
  runId?: unknown;
  messages?: unknown;
  forwardedProps?: unknown;
};

/** The text of the last user message in an AG-UI RunAgentInput. */
export function lastUserText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: unknown; content?: unknown } | null;
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part: { type?: unknown; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
        .join("");
    }
    return undefined;
  }
  return undefined;
}

/** The headers that make a response an AG-UI event stream. */
export const AGUI_STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
