/**
 * Cards in customer-facing replies (website widget and Playground), the
 * customer-side counterpart of lib/assistant-cards.ts. Over AG-UI each card
 * is a `show_<kind>` tool call whose arguments are the card's data, rendered
 * by CopilotKit in the chat panel; a stored reply keeps its cards on
 * `messages.cards`. Both kinds are built by the code from what actually
 * happened, never written by the model: quick replies come from the options
 * the worker offered, the ticket card from the ticket Jira returned.
 *
 * Email can't show cards, so an email reply never has any: its text already
 * says everything.
 */

export type ChoicesCard = {
  /** Short answers the customer can tap instead of typing. */
  options: string[];
};

export type HelpdeskTicketCard = {
  key: string;
  title: string | null;
  /** The service desk request type, when the ticket is a request. */
  requestType: string | null;
  /** True when this reply raised it; false when it added to an existing one. */
  created: boolean;
};

export type CustomerCardData = {
  choices: ChoicesCard;
  helpdesk_ticket: HelpdeskTicketCard;
};

export type CustomerCardKind = keyof CustomerCardData;

export type CustomerCard = {
  [K in CustomerCardKind]: { id: string; kind: K; data: CustomerCardData[K] };
}[CustomerCardKind];

export function customerCardToolName(kind: CustomerCardKind): string {
  return `show_${kind}`;
}

export const MAX_CHOICES = 6;
const CHOICE_CHARS = 60;

/**
 * The worker's quick-reply options, tidied: trimmed, deduplicated, short,
 * and at most a handful. Fewer than two isn't a choice.
 */
export function cleanChoices(options: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const option of options) {
    const value = option.replace(/\s+/g, " ").trim();
    if (!value || value.length > CHOICE_CHARS || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    cleaned.push(value);
    if (cleaned.length === MAX_CHOICES) break;
  }
  return cleaned.length >= 2 ? cleaned : [];
}
