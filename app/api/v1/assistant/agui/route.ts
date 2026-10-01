import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { newReplyId, runAssistantTurn } from "@/lib/assistant-turn";
import { cardToolName } from "@/lib/assistant-cards";
import type { AssistantStreamEvent } from "@/lib/assistant-agent";

// Streams per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The admin Assistant over AG-UI (https://docs.ag-ui.com), the protocol the
 * Assistant page's CopilotKit client speaks. Same turn as
 * /api/v1/assistant/chat (lib/assistant-turn.ts), streamed as server-sent
 * events while it runs:
 *
 * - STEP_STARTED/STEP_FINISHED: what the assistant is doing ("Looked up conversations")
 * - TOOL_CALL_*: one `render_<kind>` call per card (lib/assistant-cards.ts),
 *   its arguments being the card's data, rendered by CopilotKit on the page
 * - TEXT_MESSAGE_*: the reply text, streamed (absent when the cards say it all)
 * - CUSTOM "assistant.turn": the stored reply and everything else the JSON
 *   route returns (pending approvals, title, sign-in link, ...)
 *
 * The request is AG-UI's RunAgentInput: the manager's message is the last
 * user message, and the Assistant-specific fields (conversation id,
 * attachments, an approval decision, a panel button) ride in
 * forwardedProps under the JSON route's names. The server, not the client's
 * message list, is the source of truth for history.
 */

type RunAgentInput = {
  threadId?: unknown;
  runId?: unknown;
  messages?: unknown;
  forwardedProps?: unknown;
};

function lastUserText(messages: unknown): string | undefined {
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

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const input = (await req.json().catch(() => null)) as RunAgentInput | null;
  const threadId = typeof input?.threadId === "string" ? input.threadId : "";
  const runId = typeof input?.runId === "string" ? input.runId : newReplyId();
  const forwarded =
    input?.forwardedProps && typeof input.forwardedProps === "object" ? (input.forwardedProps as Record<string, unknown>) : {};
  // forwardedProps.message, when sent, is what the manager actually typed
  // (null for a click or files-only send), so the turn can tell typed words
  // from the label the page shows for a click; otherwise the last user message.
  const body: Record<string, unknown> = { message: lastUserText(input?.messages), ...forwarded };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The page went away mid-reply. The turn still finishes and is
          // stored; the page picks the reply up when the chat is reopened.
          open = false;
        }
      };

      send({ type: "RUN_STARTED", threadId, runId });
      if (!tenant) {
        send({ type: "RUN_ERROR", message: "Invalid or missing site token", code: "401" });
        controller.close();
        return;
      }

      const replyId = newReplyId();
      let textOpen = false;
      let streamedText = false;
      const onEvent = (event: AssistantStreamEvent) => {
        if (event.type === "activity") {
          send({ type: "STEP_STARTED", stepName: event.label });
          send({ type: "STEP_FINISHED", stepName: event.label });
        } else if (event.type === "card") {
          const { card } = event;
          send({ type: "TOOL_CALL_START", toolCallId: card.id, toolCallName: cardToolName(card.kind), parentMessageId: replyId });
          send({ type: "TOOL_CALL_ARGS", toolCallId: card.id, delta: JSON.stringify(card.data) });
          send({ type: "TOOL_CALL_END", toolCallId: card.id });
          send({ type: "TOOL_CALL_RESULT", messageId: `${card.id}-result`, toolCallId: card.id, content: "shown", role: "tool" });
        } else if (event.delta) {
          if (!textOpen) {
            send({ type: "TEXT_MESSAGE_START", messageId: replyId, role: "assistant" });
            textOpen = true;
          }
          streamedText = true;
          send({ type: "TEXT_MESSAGE_CONTENT", messageId: replyId, delta: event.delta });
        }
      };

      try {
        const outcome = await runAssistantTurn(req, tenant, body, { onEvent, replyId });
        if (!outcome.ok) {
          send({ type: "RUN_ERROR", message: String(outcome.body.error ?? "Request failed"), code: String(outcome.status) });
          return;
        }
        // Card clicks, chips, and decided approvals answer without the model,
        // so their text arrives whole rather than streamed.
        const answer = outcome.response.message.body;
        if (!streamedText && answer) {
          send({ type: "TEXT_MESSAGE_START", messageId: replyId, role: "assistant" });
          send({ type: "TEXT_MESSAGE_CONTENT", messageId: replyId, delta: answer });
          textOpen = true;
        }
        if (textOpen) send({ type: "TEXT_MESSAGE_END", messageId: replyId });
        send({ type: "CUSTOM", name: "assistant.turn", value: outcome.response });
        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (error) {
        send({ type: "RUN_ERROR", message: error instanceof Error ? error.message : "The assistant failed" });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
