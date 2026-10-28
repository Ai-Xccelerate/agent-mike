/**
 * Kept free of imports from the API client: the backend's tests import this file, and the backend build does not
 * type-check browser code.
 */
type ChatLine = { id: string; senderType: string; senderName: string };

/**
 * What the website chat shows once the server's copy of the conversation is known. The server is the source of truth,
 * so a manager's replies appear and a reload gets the full history, but two things only the browser has are kept: the
 * welcome line at the top, and the "can't reach the API" note a failed turn leaves (the server never saw that turn).
 */
export function mergeWidgetHistory<T extends ChatLine>(server: T[], local: T[], welcome: T): T[] {
  const localOnly = local.filter((message) => message.id.startsWith("fallback-"));
  return [welcome, ...server, ...localOnly];
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
