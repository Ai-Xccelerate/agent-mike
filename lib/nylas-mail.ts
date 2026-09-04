import { createHmac, timingSafeEqual } from "crypto";
import { marked } from "marked";
import { isDeployedEnvironment } from "@/lib/env";
import { mailboxByOrgId, type NylasMailbox } from "@/lib/nylas-mailboxes";

type NylasEmailAddress = { email?: string; name?: string };
type NylasMessage = {
  id?: string;
  grant_id?: string;
  thread_id?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  unread?: boolean;
  folders?: string[];
  from?: NylasEmailAddress[];
  to?: NylasEmailAddress[];
  cc?: NylasEmailAddress[];
};

function demoMode() {
  return (process.env.DEMO_MODE || "").toLowerCase() === "true";
}

function apiBase() {
  return (process.env.NYLAS_API_URI || "https://api.us.nylas.com").replace(/\/$/, "");
}

export function nylasApiConfigured() {
  return !demoMode() && Boolean(process.env.NYLAS_API_KEY);
}

/** App-wide Nylas API readiness. Per-org grants live in nylas_mailboxes. */
export function nylasConfigured() {
  return nylasApiConfigured();
}

export function verifyWebhook(payload: Buffer, headers: Headers) {
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) return !isDeployedEnvironment();

  const signature =
    headers.get("x-nylas-signature") || headers.get("X-Nylas-Signature") || "";
  if (!signature) return false;

  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const left = Buffer.from(digest, "utf8");
    const right = Buffer.from(signature, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function toHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const body = marked.parse(escaped, { async: false }) as string;
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a;">${body}</div>`;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function nylasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Nylas request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function resolveOutboundMailbox(organizationId: string): Promise<NylasMailbox | null> {
  if (!nylasApiConfigured()) return null;
  return mailboxByOrgId(organizationId);
}

export async function fetchMessage(
  grantId: string,
  messageId: string,
): Promise<NylasMessage | null> {
  if (!nylasApiConfigured() || !grantId) return null;
  const data = await nylasFetch<{ data?: NylasMessage }>(
    `/v3/grants/${grantId}/messages/${encodeURIComponent(messageId)}`,
  );
  return data.data ?? null;
}

function formatAddress(entry?: NylasEmailAddress | null) {
  if (!entry?.email) return "";
  if (entry.name) return `${entry.name} <${entry.email}>`;
  return entry.email;
}

export function senderFromMessage(message: NylasMessage) {
  const from = message.from?.[0];
  return formatAddress(from) || "Unknown customer";
}

export function bodyFromMessage(message: NylasMessage) {
  if (message.body) return stripHtml(message.body);
  return (message.snippet || "").trim();
}

export function isMikeOutbound(message: NylasMessage, mailboxEmail?: string | null) {
  const self = (mailboxEmail || "").trim().toLowerCase();
  const from = (message.from?.[0]?.email || "").toLowerCase();
  if (self && from === self) return true;
  const folders = (message.folders || []).map((f) => f.toLowerCase());
  return folders.some((f) => f === "sent" || f === "sent items" || f.includes("sent"));
}

export async function replyToEmail(
  organizationId: string,
  messageId: string,
  text: string,
  options?: { to?: string; subject?: string; cc?: string[] | null },
) {
  const mailbox = await resolveOutboundMailbox(organizationId);
  if (!mailbox) return null;
  const gid = mailbox.grantId;

  let toEmail = options?.to?.trim();
  let subject = options?.subject?.trim();
  if (!toEmail || !subject) {
    const original = await fetchMessage(gid, messageId);
    if (!original) throw new Error("Original Nylas message not found for reply");
    toEmail = toEmail || original.from?.[0]?.email || "";
    subject = subject || original.subject || "Support reply";
    if (!toEmail) throw new Error("Cannot reply: original sender email missing");
  }

  const payload: Record<string, unknown> = {
    reply_to_message_id: messageId,
    to: [{ email: toEmail }],
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    body: toHtml(text),
  };
  if (options?.cc?.length) {
    payload.cc = options.cc.map((email) => ({ email }));
  }

  const sent = await nylasFetch<{ data?: { id?: string } }>(`/v3/grants/${gid}/messages/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return sent.data?.id || null;
}

export async function sendEmail(
  organizationId: string,
  to: string,
  subject: string,
  text: string,
) {
  const mailbox = await resolveOutboundMailbox(organizationId);
  if (!mailbox) return null;
  const sent = await nylasFetch<{ data?: { id?: string } }>(
    `/v3/grants/${mailbox.grantId}/messages/send`,
    {
      method: "POST",
      body: JSON.stringify({
        to: [{ email: to }],
        subject,
        body: toHtml(text),
      }),
    },
  );
  return sent.data?.id || null;
}

export type { NylasMessage };
