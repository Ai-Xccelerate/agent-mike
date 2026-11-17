// After a conversation has a helpdesk ticket, what is said in the chat keeps being added to it, so whoever picks the
// ticket up has the whole conversation without logging in here. One staff-only note per exchange, in order.

import { addChatNoteToTicket } from "@/lib/tools-integrations/atlassian";

const NOTE_MESSAGE_CHARS = 1500;

function clip(text: string): string {
  const value = text.trim();
  return value.length > NOTE_MESSAGE_CHARS ? `${value.slice(0, NOTE_MESSAGE_CHARS)}…` : value;
}

function channelWords(channel: string): string {
  return channel === "widget" ? "website chat" : channel === "email" ? "email" : "chat";
}

/** What goes on the ticket for one exchange: what the customer wrote and what the worker answered. */
export function chatTurnNote(input: { channel: string; workerName: string; customerMessage: string; workerReply: string }): string {
  return [
    `The conversation continued in ${channelWords(input.channel)}.`,
    `Customer:\n\n${clip(input.customerMessage)}`,
    input.workerReply.trim() ? `${input.workerName}:\n\n${clip(input.workerReply)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Each ticket's notes are added one after the other, so a quick second message cannot land before the first.
const chains = new Map<string, Promise<unknown>>();

/** Adds the exchange to the ticket. Never throws and is never awaited by the customer's turn. */
export function logChatTurnOnTicket(input: {
  organizationId: string;
  ticketKey: string;
  channel: string;
  workerName: string;
  customerMessage: string;
  workerReply: string;
}): Promise<void> {
  const chainKey = `${input.organizationId}:${input.ticketKey}`;
  const job = (chains.get(chainKey) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => addChatNoteToTicket(input.organizationId, input.ticketKey, chatTurnNote(input)))
    .then(() => undefined)
    .catch((error: unknown) => console.warn("[ticket] chat note failed:", error instanceof Error ? error.message : error));
  chains.set(chainKey, job);
  void job.finally(() => {
    if (chains.get(chainKey) === job) chains.delete(chainKey);
  });
  return job;
}
