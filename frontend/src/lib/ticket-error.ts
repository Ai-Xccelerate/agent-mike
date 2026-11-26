/**
 * The banner a conversation shows when talking to Jira failed.
 *
 * A failure is kept on the conversation until a ticket is raised successfully. When the conversation already has a
 * ticket (a later attempt to add to it failed, for example because the AI provider was out of credits), the ticket
 * exists, so the banner must not say one wasn't created: it says the update failed and names the ticket.
 */

export function ticketErrorHeadline(ticketKey: string | null | undefined): string {
  const key = ticketKey?.trim();
  return key ? `Couldn’t update ${key}.` : "Jira ticket wasn’t created.";
}

/** One plain sentence for why. The raw error stays one click away under Details, for whoever has to fix it. */
export function ticketErrorReason(raw: string): string {
  if (/no credits|insufficient_quota|billing/i.test(raw)) return "The AI provider is out of credits. Add credits to fix this.";
  if (/\b429\b|rate limit/i.test(raw)) return "The AI provider is busy. Try again in a few minutes.";
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|permission/i.test(raw)) return "Jira refused the request. Check the Jira connection in Settings.";
  if (/request type/i.test(raw)) return "No Jira request type could be picked for this conversation.";
  if (/jira site|connection/i.test(raw)) return "The Jira connection needs attention in Settings.";
  return "Something went wrong while talking to Jira.";
}
