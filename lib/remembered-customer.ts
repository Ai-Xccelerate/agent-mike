import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A customer whose email was checked with a code is remembered on their own device, so the next visit does not
 * ask for another code. The widget keeps a signed token; this file makes and reads it.
 *
 * The token only says "this address was verified for this organization, until this date". It is signed with the
 * deployment's secret, tied to one organization, and does nothing on its own: the chat applies it when it starts
 * a new conversation, and only when the organization still asks for an emailed code.
 */

export const REMEMBER_DAYS = 90;

export type RememberedCustomer = { email: string; name: string | null };

function secret(): string | null {
  const configured = (process.env.IDENTITY_CODE_SECRET || process.env.ENCRYPTION_KEY || "").trim();
  if (configured) return configured;
  return (process.env.APP_ENV || "") === "local" ? "local-development-only-secret" : null;
}

function sign(key: string, body: string): string {
  return createHmac("sha256", key).update(`remember:${body}`).digest("base64url");
}

export function issueRememberToken(organizationId: string, customer: RememberedCustomer, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(
    JSON.stringify({ o: organizationId, e: customer.email.trim().toLowerCase(), n: customer.name, x: now + REMEMBER_DAYS * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

/** The customer a token vouches for in this organization, or null (forged, expired, or another organization's). */
export function readRememberToken(token: unknown, organizationId: string, now = Date.now()): RememberedCustomer | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 2000) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { o?: unknown; e?: unknown; n?: unknown; x?: unknown };
    if (parsed.o !== organizationId || typeof parsed.e !== "string" || typeof parsed.x !== "number" || parsed.x <= now) return null;
    return { email: parsed.e, name: typeof parsed.n === "string" && parsed.n.trim() ? parsed.n : null };
  } catch {
    return null;
  }
}
