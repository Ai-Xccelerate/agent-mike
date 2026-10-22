// The number a customer is given for their request, whether or not a helpdesk ticket exists.
// Every conversation has its own ticket number; with a helpdesk connected the customer is given its key instead
// (the one they can use on the service desk). Without one, this reference is what they quote and ask about.

import type { CustomerCard } from "@/lib/customer-cards";

export function ticketReference(prefix: string | null | undefined, ticketNumber: number): string {
  return `${prefix || "TCK"}-${ticketNumber}`;
}

/** What the customer is told when a request is handed to the team and no helpdesk ticket was raised. */
export function referenceNotice(reference: string): string {
  return `I've logged this for the team as ${reference}, so you can quote that number if you follow up. You can ask me to check it any time.`;
}

export function referenceCard(reference: string): CustomerCard {
  return {
    id: crypto.randomUUID(),
    kind: "helpdesk_ticket",
    data: { key: reference, title: null, requestType: null, created: true },
  };
}

/** A conversation's status in the words a customer sees. */
export function customerStatusWord(status: string): string {
  if (status === "resolved" || status === "closed") return "Resolved";
  if (status === "needs_human") return "With the support team";
  return "Open";
}
