import type { ToolCall, ToolMessage } from "@ag-ui/client";

/**
 * Cards in customer replies (website widget and Playground), mirroring the
 * API's lib/customer-cards.ts. Over AG-UI each card is a `show_<kind>` tool
 * call whose arguments are the card's data; CopilotKit renders it with the
 * matching renderer (components/worker/customer-cards). A stored reply keeps
 * its cards, so a reopened chat shows them the same way.
 */

export type ChoicesCard = { options: string[] };

export type HelpdeskTicketCard = {
  key: string;
  title: string | null;
  requestType: string | null;
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

const KINDS: CustomerCardKind[] = ["choices", "helpdesk_ticket"];

export function isCustomerCard(card: { kind: string }): card is CustomerCard {
  return (KINDS as string[]).includes(card.kind);
}

/** A stored card as the tool call (and its result) CopilotKit renders. */
export function cardToolCall(card: CustomerCard): { toolCall: ToolCall; toolMessage: ToolMessage } {
  return {
    toolCall: {
      id: card.id,
      type: "function",
      function: { name: customerCardToolName(card.kind), arguments: JSON.stringify(card.data) },
    },
    toolMessage: { id: `${card.id}-result`, role: "tool", toolCallId: card.id, content: "shown" },
  };
}
