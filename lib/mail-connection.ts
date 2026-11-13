import { getMailbox } from "@/lib/mailbox-repository";
import { getAccountEmail } from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";

/**
 * Which mail platform the worker is connected to, in one answer, for Identity and the Connections screen.
 *
 * Mail can be connected three ways: a mailbox (sign in with Google or Outlook through Nylas), or Gmail or Outlook through
 * Composio under Connections. lib/outbound.ts sends through the mailbox when it is connected, else Gmail, else Outlook,
 * so this says the same. Outlook through Composio sends (the verification code, handoff and manager emails) and looks up
 * messages, but Mike does not receive Outlook mail yet; the Email channel's inbox needs the mailbox or Gmail.
 */
export type MailConnection = {
  /** What the worker sends and receives through, or null when nothing can. */
  platform: "mailbox" | "gmail" | "outlook" | null;
  state: "connected" | "reconnect" | "none";
  /** The connected address, when the platform says one. */
  address: string | null;
};

type MailboxRow = { status: string; email: string | null } | null;
type IntegrationRow = { system: string; status: string } | null;

/** Pure: the answer from what is stored. `mailboxLive` is the checked state of the mailbox's grant, when it was checked. */
export function describeMailConnection(input: {
  mailbox: MailboxRow;
  mailboxLive?: boolean;
  email: IntegrationRow;
  gmailAddress?: string | null;
  outlookAddress?: string | null;
}): MailConnection {
  const { mailbox, email } = input;
  const mailboxConnected = Boolean(mailbox && mailbox.status === "connected" && input.mailboxLive !== false);
  const gmailActive = Boolean(email && email.system === "gmail" && email.status === "active");
  const outlookActive = Boolean(email && email.system === "outlook" && email.status === "active");

  if (mailboxConnected) return { platform: "mailbox", state: "connected", address: mailbox?.email ?? null };
  if (gmailActive) return { platform: "gmail", state: "connected", address: input.gmailAddress ?? null };
  if (outlookActive) return { platform: "outlook", state: "connected", address: input.outlookAddress ?? null };
  // Something was connected and no longer works (a revoked mailbox grant, a failed Gmail link): say reconnect, not "none".
  const brokenMailbox = Boolean(mailbox);
  const brokenGmail = Boolean(email && email.status !== "pending" && email.status !== "active");
  if (brokenMailbox || brokenGmail) return { platform: null, state: "reconnect", address: mailbox?.email ?? null };
  return { platform: null, state: "none", address: null };
}

/** What is connected for this organization. Never throws: a Composio hiccup only leaves the address out. */
export async function getMailConnection(organizationId: string, mailboxLive?: boolean): Promise<MailConnection> {
  const [mailbox, email] = await Promise.all([getMailbox(organizationId), getConnectionForOrg(organizationId, "email")]);
  let gmailAddress: string | null = null;
  if (email?.system === "gmail" && email.status === "active" && email.composioConnectedAccountId && !(mailbox && mailbox.status === "connected")) {
    gmailAddress = await getAccountEmail(email.composioConnectedAccountId).catch(() => null);
  }
  let outlookAddress: string | null = null;
  if (email?.system === "outlook" && email.status === "active" && email.composioConnectedAccountId && !(mailbox && mailbox.status === "connected")) {
    outlookAddress = await getAccountEmail(email.composioConnectedAccountId).catch(() => null);
  }
  return describeMailConnection({ mailbox, mailboxLive, email, gmailAddress, outlookAddress });
}
