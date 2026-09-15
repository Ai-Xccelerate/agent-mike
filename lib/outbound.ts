import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDomains } from "@/db/schema";
import { isRecipientAllowed, normalizeDomain } from "@/lib/email-domains";
import { isDemoMode } from "@/lib/env";
import { NylasError, sendMessage, type SendMessageInput } from "@/lib/nylas";
import { getMailbox } from "@/lib/mailbox-repository";

/**
 * The only way the worker sends mail.
 *
 * `lib/nylas.ts` is transport; this is policy. Keeping them apart is the whole
 * point — a future caller (a scheduled follow-up, an inbound auto-reply, a tool
 * the agent invokes) gets the allow-list for free instead of having to remember
 * it, and there is exactly one place to audit.
 *
 * The rule: every recipient's domain must be `approved` in `email_domains`.
 * Not pending, not revoked, not absent. The list is an allow-list, so an empty
 * table means the worker sends to nobody outside the org — the safe failure.
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
  replyToMessageId?: string | null;
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

  const mailbox = await getMailbox(options.orgId);
  if (!mailbox || mailbox.status !== "connected") {
    throw new OutboundBlocked(
      "No mailbox is connected — connect one under Settings > Identity.",
      [],
      "no_mailbox",
    );
  }

  const input: SendMessageInput = {
    to: recipients,
    subject: options.subject,
    body: options.body,
    replyToMessageId: options.replyToMessageId ?? null,
  };

  // Demo mode stops the send at the last possible moment, *after* the allow-list
  // and mailbox checks. A demo that skipped those would not be exercising the
  // thing most worth exercising.
  if (isDemoMode()) {
    return { id: `demo-${Date.now()}`, to: recipients.map((r) => r.email), demo: true };
  }

  const sent = await sendMessage(mailbox.grantId, input);
  return { id: sent.id, to: recipients.map((r) => r.email), demo: false };
}

/** True when an error is Nylas telling us the grant needs reconnecting. */
export function isGrantInvalid(error: unknown): boolean {
  return error instanceof NylasError && error.kind === "grant_invalid";
}
