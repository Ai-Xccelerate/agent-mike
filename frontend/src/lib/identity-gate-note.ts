type IdentityMode = "off" | "email_match" | "email_code";

/**
 * Says, next to the Customer identity setting, whether visitors are asked for their details before they can chat, and
 * why. The form has no switch of its own: it follows the identity check, "Also raise a ticket for conversations the
 * worker answers" (Integrations > Jira) and "Require user verification". Without this line the form would appear in the
 * chat with nothing on any settings page to explain it.
 */
export function identityGateNote(input: { identityMode: IdentityMode; requireUserVerification: boolean; logsEveryConversation: boolean }) {
  const { identityMode, requireUserVerification, logsEveryConversation } = input;
  const reason = logsEveryConversation
    ? "every conversation is logged as a ticket"
    : requireUserVerification
      ? "user verification is required"
      : null;
  if (identityMode === "off") {
    return logsEveryConversation
      ? {
          tone: "warning" as const,
          text: "Every conversation is set to be logged as a ticket, but the identity check is off, so nobody is asked who they are. Turn on a check below so each conversation has a customer.",
        }
      : {
          tone: "info" as const,
          text: "Customers can ask questions without giving any details, and the worker never asks who they are.",
        };
  }
  if (reason) {
    return {
      tone: "info" as const,
      text: `Visitors give their name and email${identityMode === "email_code" ? ", then an emailed code," : ""} before they can chat, because ${reason}. To change that, change ${logsEveryConversation ? "Integrations > Jira > Also raise a ticket for conversations the worker answers" : "Require user verification above"}.`,
    };
  }
  return {
    tone: "info" as const,
    text: "Customers can ask general questions without giving details. The worker asks only when a ticket is needed.",
  };
}
