import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDomains } from "@/db/schema";
import { isRecipientAllowed, normalizeDomain } from "@/lib/email-domains";
import { isDemoMode } from "@/lib/env";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  NylasError,
  resolveNylasCredentials,
  sendMessage,
  type SendMessageInput,
} from "@/lib/nylas";
import { getMailbox } from "@/lib/mailbox-repository";
import { textToEmailHtml } from "@/lib/email-text";
import { sendWithGmail } from "@/lib/composio-email";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";

/**
 * The only way the worker sends mail.
 *
 * `lib/nylas.ts` is transport; this is policy. Keeping them apart is the whole
 * point — a future caller (a scheduled follow-up, an inbound auto-reply, a tool
 * the agent invokes) gets the allow-list for free instead of having to remember
 * it, and there is exactly one place to audit.
 *
 * The rule, when Settings > Email domains is switched on
 * (`restrictEmailDomains`): every recipient's domain must be `approved` in
 * `email_domains`. Not pending, not revoked, not absent. The list is an
 * allow-list, so an empty table means the worker sends to nobody outside the
 * org. Switched off (the default), any recipient is allowed.
 *
 * A send is all-or-nothing. If one of four recipients is unapproved the whole
 * message is refused rather than quietly delivered to three, because a partial
 * send is indistinguishable to the manager from a complete one.
 */

export class OutboundBlocked extends Error {
  constructor(
    message: string,
    readonly blockedDomains: string[],
    readonly reason: "domain_not_approved" | "no_mailbox" | "channel_off",
  ) {
    super(message);
    this.name = "OutboundBlocked";
  }
}

export interface SendResult {
  id: string;
  to: string[];
  demo: boolean;
}

/** Every approved domain for an org, read fresh — an approval must take effect now. */
async function approvedRows(orgId: string) {
  return db
    .select({ domain: emailDomains.domain, status: emailDomains.status })
    .from(emailDomains)
    .where(and(eq(emailDomains.organizationId, orgId), eq(emailDomains.status, "approved")));
}

/**
 * Which of these recipients the worker may not write to.
 *
 * Exposed separately from `send` so a caller can warn *before* drafting —
 * telling someone their message was blocked after the agent spent a minute
 * writing it is worse than telling them up front.
 */
export async function blockedRecipients(orgId: string, addresses: string[]): Promise<string[]> {
  // The list only applies when Settings > Email domains is switched on.
  // Off (the default), the worker may email anyone, like any support inbox.
  const profile = await getOrCreateProfile(orgId);
  if (!profile.restrictEmailDomains) return [];

  const rows = await approvedRows(orgId);
  const blocked = new Set<string>();
  for (const address of addresses) {
    if (!isRecipientAllowed(address, rows)) {
      blocked.add(normalizeDomain(address) || address);
    }
  }
  return [...blocked];
}

export interface SendOptions {
  orgId: string;
  to: Array<{ email: string; name?: string }>;
  subject: string;
  body: string;
  /** Nylas threads a reply under the message it answers. */
  replyToMessageId?: string | null;
  /** Gmail threads a reply into the conversation's thread. */
  threadId?: string | null;
}

/**
 * How this org sends: its Nylas mailbox when one is connected, else a Gmail
 * account connected through Composio under Settings > Integrations.
 */
async function resolveTransport(orgId: string) {
  const mailbox = await getMailbox(orgId);
  if (mailbox && mailbox.status === "connected") return { kind: "nylas" as const, grantId: mailbox.grantId };
  const gmail = await getConnectionForOrg(orgId, "email");
  if (gmail?.system === "gmail" && gmail.status === "active" && gmail.composioConnectedAccountId) {
    return { kind: "gmail" as const, connectedAccountId: gmail.composioConnectedAccountId };
  }
  return null;
}

/**
 * Append the worker's email signature to an outbound body when one is set.
 * Skips when the body already ends with the same text so a draft that
 * included it is not doubled.
 */
export function applyEmailSignature(body: string, signature: string | null | undefined): string {
  const sig = (signature || "").trim();
  if (!sig) return body;
  const trimmed = body.replace(/\s+$/, "");
  if (!trimmed) return sig;
  // Compared with whitespace flattened: a model or a person retyping the
  // signature rarely matches its line endings and spacing exactly, and an
  // exact comparison let "Best, Mike" go out twice.
  const flat = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  if (flat(trimmed).endsWith(flat(sig))) return trimmed;
  return `${trimmed}\n\n${sig}`;
}

/**
 * Sends as the worker, or refuses and says which domain stopped it.
 *
 * Order matters: the allow-list is checked before the mailbox is touched, so a
 * blocked send never reaches Nylas at all rather than being refused somewhere
 * downstream.
 */
export async function sendAsWorker(options: SendOptions): Promise<SendResult> {
  const recipients = options.to.filter((r) => r.email?.trim());
  if (!recipients.length) {
    throw new OutboundBlocked("No recipients", [], "domain_not_approved");
  }

  const blocked = await blockedRecipients(
    options.orgId,
    recipients.map((r) => r.email),
  );
  if (blocked.length) {
    throw new OutboundBlocked(
      `Not approved to email ${blocked.join(", ")}. Approve the domain under Settings > Email domains.`,
      blocked,
      "domain_not_approved",
    );
  }

  const transport = await resolveTransport(options.orgId);
  if (!transport) {
    throw new OutboundBlocked(
      "No mailbox is connected. Connect Gmail under Settings > Integrations, or a Nylas mailbox under Settings > Tools.",
      [],
      "no_mailbox",
    );
  }

  // Signature belongs on email only — applied here so every outbound send
  // gets it, independent of whether the body was drafted by the agent or a manager.
  const profile = await getOrCreateProfile(options.orgId);
  // Bodies are written as plain text; Nylas sends HTML, where bare newlines
  // collapse, so paragraphs and line breaks are turned into markup here.
  const body = textToEmailHtml(applyEmailSignature(options.body, profile.emailSignature));

  const input: SendMessageInput = {
    to: recipients,
    subject: options.subject,
    body,
    replyToMessageId: options.replyToMessageId ?? null,
  };

  // Demo mode stops the send at the last possible moment, *after* the allow-list
  // and mailbox checks. A demo that skipped those would not be exercising the
  // thing most worth exercising.
  if (isDemoMode()) {
    return { id: `demo-${Date.now()}`, to: recipients.map((r) => r.email), demo: true };
  }

  if (transport.kind === "gmail") {
    // Gmail's send and reply tools take one primary recipient. The worker
    // only ever writes to one (the customer, or the manager), so more is a
    // caller bug, refused rather than half-sent.
    if (recipients.length > 1) {
      throw new OutboundBlocked("Gmail sends to one recipient at a time.", [], "no_mailbox");
    }
    const sent = await sendWithGmail({
      organizationId: options.orgId,
      connectedAccountId: transport.connectedAccountId,
      to: recipients[0].email,
      subject: options.subject,
      html: body,
      threadId: options.threadId ?? null,
    });
    return { id: sent.id, to: [recipients[0].email], demo: false };
  }

  // Resolved per agent: this org's own Nylas application if it has one, the
  // fleet's otherwise.
  const credentials = await resolveNylasCredentials(options.orgId);
  if (!credentials) {
    throw new OutboundBlocked(
      "No Nylas application is configured for this organization.",
      [],
      "no_mailbox",
    );
  }

  const sent = await sendMessage(credentials.values, transport.grantId, input);
  return { id: sent.id, to: recipients.map((r) => r.email), demo: false };
}

/** True when an error is Nylas telling us the grant needs reconnecting. */
export function isGrantInvalid(error: unknown): boolean {
  return error instanceof NylasError && error.kind === "grant_invalid";
}
