import { helpdeskTicketsEveryConversation } from "@/lib/tools-integrations/atlassian";
import { normalizeIdentityMode } from "@/lib/customer-identity";

/**
 * Whether the website chat must know who is writing before it answers (the "details before the chat" form).
 *
 * Only when the organization has turned on logging every conversation as a ticket (Settings > Integrations > Jira) or
 * requiring user verification (Settings > Guardrails), and an identity check is on to collect the details with.
 * Otherwise a customer may ask general questions without giving anything, and the worker asks for details only when
 * a ticket is needed.
 */
export async function identityGateRequired(
  organizationId: string,
  profile: { identityMode: string | null; requireUserVerification: boolean },
): Promise<boolean> {
  if (normalizeIdentityMode(profile.identityMode) === "off") return false;
  if (profile.requireUserVerification) return true;
  return helpdeskTicketsEveryConversation(organizationId);
}
