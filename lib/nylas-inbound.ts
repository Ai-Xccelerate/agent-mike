import { createHmac, timingSafeEqual } from "crypto";
import type { NylasMessage } from "@/lib/nylas";

function deployedEnvironment(): boolean {
  const name = (
    process.env.APP_ENV ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    ""
  ).toLowerCase();
  return Boolean(process.env.RAILWAY_ENVIRONMENT) || name === "staging" || name === "production";
}

export function verifyNylasWebhook(payload: Buffer, headers: Headers): boolean {
  const secret = (process.env.NYLAS_WEBHOOK_SECRET || "").trim();
  if (!secret) return !deployedEnvironment();
  const signature = headers.get("x-nylas-signature") || "";
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(signature, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function cleanInboundEmailText(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\[image:[^\]]*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function bodyFromNylasMessage(message: NylasMessage): string {
  return cleanInboundEmailText(message.body || message.snippet || "");
}

export function senderFromNylasMessage(message: NylasMessage): {
  email: string;
  name: string;
  label: string;
} {
  const from = message.from?.[0];
  const email = (from?.email || "").trim();
  const name = (from?.name || "").trim();
  return {
    email,
    name: name || email || "Unknown customer",
    label: name && email ? `${name} <${email}>` : email || name || "Unknown customer",
  };
}

export function isWorkerOutbound(message: NylasMessage, mailboxEmail: string): boolean {
  const self = mailboxEmail.trim().toLowerCase();
  const sender = (message.from?.[0]?.email || "").trim().toLowerCase();
  if (self && sender === self) return true;
  return (message.folders || []).some((folder) => folder.toLowerCase().includes("sent"));
}
