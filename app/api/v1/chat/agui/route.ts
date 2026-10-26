import type { NextRequest } from "next/server";
import { AGUI_STREAM_HEADERS, lastUserText, type RunAgentInput } from "@/lib/agui";
import { runChatRequest } from "@/lib/chat-turn";
import { customerCardToolName, type CustomerCard } from "@/lib/customer-cards";

// Streams per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The customer chat (website widget and Playground) over AG-UI, the protocol
 * the chat panel's CopilotKit client speaks. Same turn as /api/v1/chat
 * (lib/chat-turn.ts), and the same auth: a widget's site token header, or the
 * manager's own sign-in for the Playground. Sent as server-sent events once
 * the turn is done:
 *
 * - TEXT_MESSAGE_*: the reply text
 * - TOOL_CALL_*: one `show_<kind>` call per card (lib/customer-cards.ts), its
 *   arguments being the card's data, rendered by CopilotKit in the panel
 * - CUSTOM "chat.turn": everything the JSON route returns (conversation id,
 *   the stored reply, whether a person was brought in)
 *
 * The customer's message is the last user message; the conversation id rides
 * in forwardedProps.conversation_id. The server, not the client's message
 * list, is the source of truth for history.
 */
export async function POST(req: NextRequest) {
  const input = (await req.json().catch(() => null)) as RunAgentInput | null;
  const threadId = typeof input?.threadId === "string" ? input.threadId : "";
  const runId = typeof input?.runId === "string" ? input.runId : crypto.randomUUID();
  const forwarded =
    input?.forwardedProps && typeof input.forwardedProps === "object" ? (input.forwardedProps as Record<string, unknown>) : {};
  const body = { message: lastUserText(input?.messages), conversation_id: forwarded.conversation_id, remember_token: forwarded.remember_token, attachment_ids: forwarded.attachment_ids };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The visitor closed the page mid-reply. The turn still finishes and is stored.
          open = false;
        }
      };

      send({ type: "RUN_STARTED", threadId, runId });
      try {
        // Progress while the turn runs: only what the server is really doing, never an outcome.
        const outcome = await runChatRequest(req, body, {
          deferTicket: true,
          onStatus: (stage, label) => send({ type: "CUSTOM", name: "chat.status", value: { stage, label } }),
        });
        if (outcome.status !== 200) {
          send({ type: "RUN_ERROR", message: String(outcome.json.error ?? "Request failed"), code: String(outcome.status) });
          return;
        }
        const reply = outcome.json.message as { id: string; body: string; cards?: CustomerCard[] } | null;
        if (reply) {
          send({ type: "TEXT_MESSAGE_START", messageId: reply.id, role: "assistant" });
          send({ type: "TEXT_MESSAGE_CONTENT", messageId: reply.id, delta: reply.body });
          send({ type: "TEXT_MESSAGE_END", messageId: reply.id });
          for (const card of reply.cards ?? []) {
            send({ type: "TOOL_CALL_START", toolCallId: card.id, toolCallName: customerCardToolName(card.kind), parentMessageId: reply.id });
            send({ type: "TOOL_CALL_ARGS", toolCallId: card.id, delta: JSON.stringify(card.data) });
            send({ type: "TOOL_CALL_END", toolCallId: card.id });
            send({ type: "TOOL_CALL_RESULT", messageId: `${card.id}-result`, toolCallId: card.id, content: "shown", role: "tool" });
          }
        }
        send({ type: "CUSTOM", name: "chat.turn", value: outcome.json });
        // A handoff's ticket is raised after the reply is shown. Its number follows as a
        // second message, inside the same run, so the panel shows the reply right away.
        if (outcome.pendingTicket) send({ type: "CUSTOM", name: "chat.status", value: { stage: "ticket", label: "Logging this for the team…" } });
        const ticket = outcome.pendingTicket ? await outcome.pendingTicket : null;
        if (ticket) {
          const note = ticket.message as { id: string; body: string; cards?: CustomerCard[] };
          // The panel builds its list from the turn's own messages, so it is handed this one whole.
          send({ type: "CUSTOM", name: "chat.ticket", value: ticket.message });
          send({ type: "TEXT_MESSAGE_START", messageId: note.id, role: "assistant" });
          send({ type: "TEXT_MESSAGE_CONTENT", messageId: note.id, delta: note.body });
          send({ type: "TEXT_MESSAGE_END", messageId: note.id });
          for (const card of note.cards ?? []) {
            send({ type: "TOOL_CALL_START", toolCallId: card.id, toolCallName: customerCardToolName(card.kind), parentMessageId: note.id });
            send({ type: "TOOL_CALL_ARGS", toolCallId: card.id, delta: JSON.stringify(card.data) });
            send({ type: "TOOL_CALL_END", toolCallId: card.id });
            send({ type: "TOOL_CALL_RESULT", messageId: `${card.id}-result`, toolCallId: card.id, content: "shown", role: "tool" });
          }
        }
        send({ type: "RUN_FINISHED", threadId, runId });
      } catch (error) {
        send({ type: "RUN_ERROR", message: error instanceof Error ? error.message : "The chat failed" });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, { headers: AGUI_STREAM_HEADERS });
}
