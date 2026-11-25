/**
 * The website chat's history drawer: the choices it makes, kept apart from the screen so they can be tested.
 * What the server returns is in app/api/v1/chat/conversations/route.ts.
 *
 * Kept free of imports from the API client: the backend's tests import this file, and the backend build does not
 * type-check browser code.
 */

export type HistoryChat = {
  id: string;
  title: string;
  /** Finished: shown read-only, with a way to start a new chat. */
  resolved: boolean;
  waitingForTeam: boolean;
  ticketKey: string | null;
  lastMessageAt: string;
};

export type HistoryResponse = {
  available: boolean;
  conversations: {
    id: string;
    title: string;
    resolved: boolean;
    waiting_for_team: boolean;
    ticket_key: string | null;
    last_message_at: string;
  }[];
};

export function chatsFromResponse(response: HistoryResponse | null | undefined): HistoryChat[] {
  if (!response?.available || !Array.isArray(response.conversations)) return [];
  return response.conversations.map((chat) => ({
    id: chat.id,
    title: chat.title,
    resolved: chat.resolved,
    waitingForTeam: chat.waiting_for_team,
    ticketKey: chat.ticket_key,
    lastMessageAt: chat.last_message_at,
  }));
}

/** A chat opened from the drawer that is finished: read-only, apart from the active chat. */
export type ViewedChat<M = unknown> = { id: string; title: string; messages: M[] };

/** What the customer can do with a chat they opened: continue a live one, or only read a finished one. */
export function openingMode(chat: Pick<HistoryChat, "resolved">): "continue" | "read" {
  return chat.resolved ? "read" : "continue";
}

/**
 * Whether "New chat" first asks. Only when the current chat is with the team (a handover happened and nobody has
 * closed it): starting another then can look like the problem was dropped. A chat the worker answered, or one the
 * customer is only reading, starts the new one straight away.
 */
export function newChatNeedsConfirmation(state: { waitingForTeam: boolean; reading: boolean }): boolean {
  return state.waitingForTeam && !state.reading;
}

export function newChatConfirmationText(ticketKey: string | null | undefined): string {
  const ticket = ticketKey ? `You have an open ticket, ${ticketKey}.` : "You have an open ticket.";
  return `${ticket} Start a new chat anyway? This chat stays in your history.`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Yesterday", or "20 Nov", in the customer's own time. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** The small line under a chat's title: when, then its ticket or that it is finished. */
export function chatMeta(chat: HistoryChat, now: Date = new Date()): string {
  const parts = [whenLabel(chat.lastMessageAt, now)];
  if (chat.ticketKey) parts.push(`Ticket ${chat.ticketKey}`);
  if (chat.resolved) parts.push("Resolved");
  else if (chat.waitingForTeam) parts.push("With our team");
  return parts.filter(Boolean).join(" · ");
}
