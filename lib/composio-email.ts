import {
  GMAIL_REPLY_TO_THREAD_SLUG,
  GMAIL_SEND_EMAIL_SLUG,
  GMAIL_TOOLKIT_VERSION,
} from "@/lib/agent";
import { executeTool, getComposioClient } from "@/lib/tools-integrations/composio-client";

/**
 * The email channel over a Gmail account connected through Composio, the
 * alternative to a Nylas mailbox.
 *
 * Receiving: a GMAIL_NEW_GMAIL_MESSAGE trigger polls the connected inbox and
 * Composio posts each new message to /api/v1/webhooks/composio, signed with
 * the project's webhook secret. Sending: replies go out through the same
 * connected account with GMAIL_REPLY_TO_THREAD, so the customer sees the
 * answer from the support address, in the thread they started.
 *
 * The connected account says which organization a delivery belongs to:
 * Mike links every Composio account with the org id as the Composio user id.
 */

export const GMAIL_NEW_MESSAGE_TRIGGER = "GMAIL_NEW_GMAIL_MESSAGE";

/** The project's webhook signing secret, from the Composio dashboard. */
export function composioWebhookSecret(): string {
  return (process.env.COMPOSIO_WEBHOOK_SECRET || "").trim();
}

export interface GmailInboundEmail {
  messageId: string;
  threadId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  /** Plain text or HTML, as Gmail gave it. */
  body: string;
  labelIds: string[];
  headers: Record<string, string>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** "Anna Customer <anna@customer.com>" → name and lowercased address. */
export function parseAddress(raw: string): { email: string; name: string } {
  const value = raw.trim();
  const angled = value.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { email: angled[2].trim().toLowerCase(), name };
  }
  return { email: value.toLowerCase(), name: "" };
}

function headerMap(raw: unknown): Record<string, string> {
  const list = (raw as { headers?: unknown } | null)?.headers;
  if (!Array.isArray(list)) return {};
  const headers: Record<string, string> = {};
  for (const entry of list) {
    const name = str((entry as { name?: unknown })?.name).toLowerCase();
    if (name) headers[name] = str((entry as { value?: unknown })?.value);
  }
  return headers;
}

/** The trigger's event data, or null when it isn't a usable message. */
export function toGmailInbound(data: Record<string, unknown> | undefined): GmailInboundEmail | null {
  if (!data) return null;
  const messageId = str(data.message_id) || str(data.id);
  const sender = parseAddress(str(data.sender));
  if (!messageId || !sender.email) return null;
  return {
    messageId,
    threadId: str(data.thread_id) || messageId,
    senderEmail: sender.email,
    senderName: sender.name,
    subject: str(data.subject),
    body: typeof data.message_text === "string" ? data.message_text : "",
    labelIds: Array.isArray(data.label_ids) ? data.label_ids.map((label) => String(label).toUpperCase()) : [],
    headers: headerMap(data.payload),
  };
}

const AUTOMATED_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?)([+._-].*)?@/i;

/**
 * Mail that no person is waiting on an answer to: bounces, out-of-office
 * replies, newsletters. Answering it wastes a turn at best, and at worst two
 * auto-responders answer each other forever.
 */
export function isAutomatedEmail(email: Pick<GmailInboundEmail, "senderEmail" | "headers">): boolean {
  if (AUTOMATED_SENDER.test(email.senderEmail)) return true;
  const { headers } = email;
  const autoSubmitted = (headers["auto-submitted"] || "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(headers["precedence"] || "")) return true;
  if (headers["x-autoreply"] || headers["x-autorespond"] || headers["list-unsubscribe"]) return true;
  return false;
}

function successfulData(result: unknown, action: string): Record<string, unknown> {
  const outcome = result as { successful?: boolean; error?: unknown; data?: unknown } | null;
  if (!outcome || outcome.successful === false) {
    throw new Error(`Gmail ${action} failed: ${String(outcome?.error ?? "no response")}`);
  }
  return (outcome.data as Record<string, unknown>) ?? {};
}

/** Sends through the connected Gmail account; in the thread when one is given. */
export async function sendWithGmail(input: {
  organizationId: string;
  connectedAccountId: string;
  to: string;
  subject: string;
  html: string;
  threadId?: string | null;
}): Promise<{ id: string }> {
  const options = {
    connectedAccountId: input.connectedAccountId,
    userId: input.organizationId,
    version: GMAIL_TOOLKIT_VERSION,
  };
  const result = input.threadId
    ? await executeTool(
        GMAIL_REPLY_TO_THREAD_SLUG,
        { thread_id: input.threadId, recipient_email: input.to, message_body: input.html, is_html: true },
        options,
      )
    : await executeTool(
        GMAIL_SEND_EMAIL_SLUG,
        { recipient_email: input.to, subject: input.subject, body: input.html, is_html: true },
        options,
      );
  const data = successfulData(result, input.threadId ? "reply" : "send");
  // The sent message comes back as a Gmail message, sometimes wrapped.
  const id = str(data.id) || str((data.response_data as { id?: unknown } | undefined)?.id);
  return { id: id || `gmail-${Date.now()}` };
}

/**
 * Starts receiving for a connected Gmail account. Composio upserts trigger
 * instances per account and slug, so calling this again is harmless.
 */
export async function ensureGmailInboundTrigger(organizationId: string, connectedAccountId: string): Promise<string> {
  const created = await getComposioClient().triggers.create(organizationId, GMAIL_NEW_MESSAGE_TRIGGER, {
    connectedAccountId,
    triggerConfig: { labelIds: "INBOX", userId: "me" },
  });
  return created.triggerId;
}

type ConnectionLike = {
  organizationId: string;
  integrationType: string;
  system: string;
  composioConnectedAccountId: string | null;
};

function isGmailEmail(row: ConnectionLike): row is ConnectionLike & { composioConnectedAccountId: string } {
  return row.integrationType === "email" && row.system === "gmail" && Boolean(row.composioConnectedAccountId);
}

/**
 * Called when a connection turns active. Never throws: a failed trigger must
 * not fail the connect, but it is logged loudly because without it the
 * mailbox sends and never receives.
 */
export async function startReceivingIfGmail(row: ConnectionLike): Promise<void> {
  if (!isGmailEmail(row)) return;
  try {
    const triggerId = await ensureGmailInboundTrigger(row.organizationId, row.composioConnectedAccountId);
    console.info(`[composio-email] receiving for org ${row.organizationId} via trigger ${triggerId}`);
  } catch (error) {
    console.error(
      `[composio-email] could not start receiving for org ${row.organizationId}; inbound email will not arrive`,
      error,
    );
  }
}

/** Called before a connection is removed. Never throws. */
export async function stopReceivingIfGmail(row: ConnectionLike): Promise<void> {
  if (!isGmailEmail(row)) return;
  try {
    await removeGmailInboundTriggers(row.composioConnectedAccountId);
  } catch (error) {
    console.warn(`[composio-email] could not remove triggers for ${row.composioConnectedAccountId}`, error);
  }
}

/** Stops receiving for an account that is being disconnected. Best effort. */
export async function removeGmailInboundTriggers(connectedAccountId: string): Promise<void> {
  const client = getComposioClient();
  const active = await client.triggers.listActive({
    connectedAccountIds: [connectedAccountId],
    triggerNames: [GMAIL_NEW_MESSAGE_TRIGGER],
  });
  for (const item of active.items ?? []) {
    await client.triggers.delete(item.id);
  }
}
