/**
 * Kept free of imports from the API client: the backend's tests import this file, and the backend build does not
 * type-check browser code.
 */
type ChatLine = { id: string; senderType: string; senderName: string; body?: string };

/**
 * What the website chat shows once the server's copy of the conversation is known. The server is the source of truth,
 * so a manager's replies appear and a reload gets the full history, but two things only the browser has are kept: the
 * welcome line at the top, and the "can't reach the API" note a failed turn leaves (the server never saw that turn).
 */
export function mergeWidgetHistory<T extends ChatLine>(server: T[], local: T[], welcome: T): T[] {
  const localOnly = local.filter((message, index) => message.id.startsWith("fallback-") && !answeredOnServer(local, index, server));
  return [welcome, ...server, ...localOnly];
}

/**
 * Whether the turn a "can't reach the API" note followed did reach the server after all and was answered: the server
 * holds the same customer message with a reply after it. 27 Nov, staging: a 32-second turn lost its stream in the
 * browser, the server still answered and raised a ticket, and the note stayed at the bottom under the real reply.
 */
function answeredOnServer<T extends ChatLine>(local: T[], fallbackIndex: number, server: T[]): boolean {
  const asked = local
    .slice(0, fallbackIndex)
    .reverse()
    .find((message) => message.senderType === "customer");
  const text = asked?.body?.trim();
  if (!text) return false;
  for (let index = server.length - 1; index >= 0; index--) {
    if (server[index].senderType === "customer" && server[index].body?.trim().startsWith(text)) {
      return server.slice(index + 1).some((message) => message.senderType === "agent" || message.senderType === "manager");
    }
  }
  return false;
}

/** True when two lists show the same messages in the same order, so a poll that found nothing new changes nothing. */
export function sameMessages<T extends ChatLine>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((message, index) => message.id === b[index].id);
}

/** Messages the server holds that the chat is not showing yet. */
export function newFromServer<T extends ChatLine>(server: T[], local: T[]): T[] {
  const shown = new Set(local.map((message) => message.id));
  return server.filter((message) => !shown.has(message.id));
}

/** The staff member who has the conversation, from its newest manager message, or null when nobody does. */
export function currentStaffName(messages: ChatLine[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].senderType === "manager") return messages[index].senderName;
  }
  return null;
}
