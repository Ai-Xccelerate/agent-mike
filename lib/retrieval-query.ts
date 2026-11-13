/**
 * What to look up in the help articles for a customer's latest message. A short follow-up ("that didn't work", "yes"), or an
 * answer to a question the worker or team just asked ("I mean training my own staff"), says little by itself, so the
 * customer's two earlier messages are searched with it: the answer alone finds install guides, but with the question it
 * answers it finds the right area.
 */

const SHORT_MESSAGE_WORDS = 8;
const QUERY_CHARS = 600;

type Line = { senderType: string; body: string };

export function retrievalQueryFor(transcript: Line[]): string {
  const customer = transcript.filter((message) => message.senderType === "customer").map((message) => message.body.trim()).filter(Boolean);
  const last = customer[customer.length - 1] ?? "";
  const lastIndex = transcript.map((message) => message.senderType).lastIndexOf("customer");
  const before = lastIndex > 0 ? transcript[lastIndex - 1] : undefined;
  const answeringAQuestion = Boolean(before && before.senderType !== "customer" && before.body.includes("?"));
  if (last.split(/\s+/).filter(Boolean).length >= SHORT_MESSAGE_WORDS && !answeringAQuestion) return last;
  const earlier = customer.slice(0, -1).slice(-2).join(" ");
  return `${earlier} ${last}`.trim().slice(0, QUERY_CHARS);
}

/**
 * The conversation as the search sees it. In the Playground the person testing writes as the customer but is stored as a
 * manager, so there their lines count as the customer's; in a real conversation a manager's reply is not the customer's.
 */
export function searchLines(channel: string, rows: Line[]): Line[] {
  return rows.map((row) => ({ senderType: channel === "chat" && row.senderType === "manager" ? "customer" : row.senderType, body: row.body }));
}

/** The text searched for this customer message. Never empty: the message itself is the fallback. */
export function searchQueryFor(channel: string, prior: Line[], message: Line): string {
  return retrievalQueryFor(searchLines(channel, [...prior, message])) || message.body.trim();
}
