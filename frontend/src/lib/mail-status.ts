import type { MailboxStatus } from "./worker-api";

/**
 * What Identity says about the worker's email. It follows the API's `mail` answer, which is whichever of the two ways
 * mail can be connected (the mailbox, or Gmail under Connections) the worker really sends through. A server that does
 * not send `mail` yet is read the old way, from the mailbox alone.
 */
export type MailStatusView = {
  /** "Mailbox", "Gmail", "Outlook" or plain "Email" when nothing is connected. */
  name: string;
  badge: { color: "success" | "warning" | "light"; label: string } | null;
  address: string | null;
  connected: boolean;
};

export function mailStatusView(status: MailboxStatus | null | "failed"): MailStatusView {
  if (status === null) return { name: "Email", badge: null, address: null, connected: false };
  if (status === "failed") return { name: "Email", badge: { color: "light", label: "Status unavailable" }, address: null, connected: false };

  const mail = status.mail;
  if (mail) {
    const name = mail.platform === "gmail" ? "Gmail" : mail.platform === "outlook" ? "Outlook" : mail.platform === "mailbox" ? "Mailbox" : "Email";
    if (mail.state === "connected") return { name, badge: { color: "success", label: "Connected" }, address: mail.address, connected: true };
    if (mail.state === "reconnect") return { name, badge: { color: "warning", label: "Reconnect needed" }, address: mail.address, connected: false };
    return { name, badge: { color: "light", label: "Not connected" }, address: null, connected: false };
  }

  const badge: MailStatusView["badge"] = !status.available
    ? { color: "light", label: "Not configured" }
    : !status.mailbox
      ? { color: "light", label: "Not connected" }
      : status.mailbox.status === "invalid" || !status.connected
        ? { color: "warning", label: "Reconnect needed" }
        : { color: "success", label: "Connected" };
  return { name: "Mailbox", badge, address: status.mailbox?.email ?? null, connected: badge.color === "success" };
}

/** The connected address, when it is not already the support email (compared without case). */
export function suggestedSupportEmail(address: string | null, supportEmail: string | null | undefined): string | null {
  if (!address) return null;
  return (supportEmail ?? "").trim().toLowerCase() === address.trim().toLowerCase() ? null : address;
}
