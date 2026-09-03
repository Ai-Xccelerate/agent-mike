import { marked } from "marked";
import { Webhook } from "svix";
import { isDeployedEnvironment } from "@/lib/env";

function configured() {
  const demo = (process.env.DEMO_MODE || "").toLowerCase() === "true";
  return !demo && Boolean(process.env.AGENTMAIL_API_KEY) && Boolean(process.env.AGENTMAIL_INBOX_ID);
}

export function verifyWebhook(payload: Buffer, headers: Headers) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return !isDeployedEnvironment();
  try {
    const webhook = new Webhook(secret);
    webhook.verify(payload, {
      "svix-id": headers.get("svix-id") || "",
      "svix-timestamp": headers.get("svix-timestamp") || "",
      "svix-signature": headers.get("svix-signature") || "",
    });
    return true;
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

function toPlain(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .trim();
}

async function agentmailFetch(path: string, init: RequestInit) {
  const res = await fetch(`https://api.agentmail.to${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`AgentMail request failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ message_id?: string; id?: string }>;
}

export async function replyToEmail(messageId: string, text: string, cc?: string[] | null) {
  if (!configured()) return null;
  const inboxId = process.env.AGENTMAIL_INBOX_ID as string;
  const payload: Record<string, unknown> = {
    text: toPlain(text),
    html: toHtml(text),
  };
  if (cc?.length) payload.cc = cc;
  const reply = await agentmailFetch(`/v0/inboxes/${inboxId}/messages/${messageId}/reply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return reply.message_id || reply.id || null;
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (!configured()) return null;
  const inboxId = process.env.AGENTMAIL_INBOX_ID as string;
  const sent = await agentmailFetch(`/v0/inboxes/${inboxId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      to: [to],
      subject,
      text: toPlain(text),
      html: toHtml(text),
    }),
  });
  return sent.message_id || sent.id || null;
}

export function agentmailOrgId() {
  const configuredOrg =
    process.env.AGENTMAIL_ORG_ID || process.env.MIKE_WIDGET_ORG_ID || process.env.MIKE_DEV_ORG_ID;
  if (configuredOrg) return configuredOrg;
  if (isDeployedEnvironment()) return null;
  return "dev-org";
}
