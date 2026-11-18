/**
 * What to look up in the help articles for a customer's latest message. A short follow-up ("that didn't work", "yes"), or an
 * answer to a question the worker or team just asked ("I mean training my own staff"), says little by itself, so the
 * customer's two earlier messages are searched with it: the answer alone finds install guides, but with the question it
 * answers it finds the right area.
 */

import type { KnowledgeMatch } from "@/lib/knowledge";

const SHORT_MESSAGE_WORDS = 8;

/** What a retrieval returns: the pages found, and where each source stood (see lib/retrieval.ts). */
type Retrieved = { matches: KnowledgeMatch[]; sources: { source: string; count: number; error: string | null; via?: string }[] };

const QUERY_CHARS = 600;

type Line = { senderType: string; body: string };

/**
 * "No error" and "not working" say what is absent, but a keyword search reads "error" and "working" as words to find, and
 * a page whose title says "Error" then outranks the one that answers. The negator and the word it negates are left out.
 * Never returns an empty search: with nothing left, the text as it was is searched.
 */
export function withoutNegatedWords(text: string): string {
  const cleaned = text.replace(/\b(?:no|not|without|never)\s+[\p{L}][\p{L}\p{N}'-]*/giu, " ").replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : text.trim();
}

/** Whether the latest customer message leans on what came before it: short, or the answer to a question just asked. */
function leansOnEarlier(transcript: Line[]): boolean {
  const customer = transcript.filter((message) => message.senderType === "customer").map((message) => message.body.trim()).filter(Boolean);
  const last = customer[customer.length - 1] ?? "";
  const lastIndex = transcript.map((message) => message.senderType).lastIndexOf("customer");
  const before = lastIndex > 0 ? transcript[lastIndex - 1] : undefined;
  const answeringAQuestion = Boolean(before && before.senderType !== "customer" && before.body.includes("?"));
  return last.split(/\s+/).filter(Boolean).length < SHORT_MESSAGE_WORDS || answeringAQuestion;
}

export function retrievalQueryFor(transcript: Line[]): string {
  const customer = transcript.filter((message) => message.senderType === "customer").map((message) => message.body.trim()).filter(Boolean);
  const last = customer[customer.length - 1] ?? "";
  if (!leansOnEarlier(transcript)) return withoutNegatedWords(last);
  const earlier = customer.slice(0, -1).slice(-2).join(" ");
  return withoutNegatedWords(`${earlier} ${last}`.trim().slice(0, QUERY_CHARS));
}

/**
 * What the customer's earlier messages alone are about, for a latest message that only answers or follows up. Its pages are
 * kept next to the ones found for the combined text, so a short answer ("connection fails") cannot push out the pages that
 * answered the question it follows. Null when the message stands on its own, or there is nothing earlier.
 */
export function earlierQueryFor(transcript: Line[]): string | null {
  if (!leansOnEarlier(transcript)) return null;
  const customer = transcript.filter((message) => message.senderType === "customer").map((message) => message.body.trim()).filter(Boolean);
  const earlier = customer.slice(0, -1).slice(-2).join(" ").trim().slice(0, QUERY_CHARS);
  return earlier ? withoutNegatedWords(earlier) : null;
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

/** The earlier messages alone, when this one only follows up on them (see earlierQueryFor). */
export function earlierSearchQueryFor(channel: string, prior: Line[], message: Line): string | null {
  return earlierQueryFor(searchLines(channel, [...prior, message]));
}

/**
 * The pages found for a follow-up's own words, plus up to `extra` found for the earlier messages alone that are not already
 * among them, after them. The follow-up's results keep their order and place.
 */
export function withEarlierPages(main: Retrieved, earlier: Retrieved | null, extra = 3): Retrieved {
  if (!earlier || extra <= 0) return main;
  const keyOf = (match: KnowledgeMatch) => `${match.documentId}\u0000${match.title}\u0000${match.heading ?? ""}`;
  const present = new Set(main.matches.map(keyOf));
  const kept = earlier.matches.filter((match) => !present.has(keyOf(match))).slice(0, extra);
  return kept.length === 0 ? main : { matches: [...main.matches, ...kept], sources: main.sources };
}
