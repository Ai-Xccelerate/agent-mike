import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, emailVerificationCodes } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { OutboundBlocked, sendAsWorker } from "@/lib/outbound";

/**
 * Who a widget visitor is, and whether we have checked.
 *
 * Settings > Guardrails > Customer identity decides how much the worker asks:
 *
 * - off          nothing is asked (every existing worker).
 * - email_match  a card asks for a name and an email. They are only what the
 *                visitor said: the worker may raise a ticket for them, but
 *                never reads out tickets or account details, because anyone
 *                can type someone else's address.
 * - email_code   as above, then a 6-digit code is emailed to the address and
 *                typed back. Only then is the email trusted
 *                (`customerEmailVerifiedAt`): ticket lookup, Jira customer
 *                creation and raising a ticket on the customer's behalf.
 *
 * Trust is decided here, in code, from stored facts. The model is told what is
 * known, but nothing it says can make an address verified.
 */

export const IDENTITY_MODES = ["off", "email_match", "email_code"] as const;
export type IdentityMode = (typeof IDENTITY_MODES)[number];

export function normalizeIdentityMode(value: unknown): IdentityMode {
  return (IDENTITY_MODES as readonly string[]).includes(value as string) ? (value as IdentityMode) : "off";
}

/** Limits on emailed codes, in one place so they can be tuned. */
export const IDENTITY_LIMITS = {
  /** A code lives this long. */
  codeTtlMs: 10 * 60 * 1000,
  /** Wrong guesses before the code is burned. A 6-digit code is only a million possibilities. */
  maxAttempts: 5,
  /** One code per conversation per this long. */
  resendCooldownMs: 60 * 1000,
  /** Per address, so a mailbox owner isn't spammed through our widget. */
  perEmail: [
    { windowMs: 15 * 60 * 1000, max: 3 },
    { windowMs: 24 * 60 * 60 * 1000, max: 10 },
  ],
  /** Per client address, so one person can't try many mailboxes. */
  perIp: { windowMs: 60 * 60 * 1000, max: 10 },
  /** Backstop against a bot swarm running up email costs. */
  perOrganization: { windowMs: 24 * 60 * 60 * 1000, max: 200 },
} as const;

export { isPlaceholderCustomerName } from "@/lib/customer-name";

/** A short label for an anonymous visitor, so the inbox doesn't read "Website visitor" on every row. */
export function anonymousVisitorName(): string {
  return `Visitor ${randomInt(1000, 10000)}`;
}

type IdentityRow = {
  channel: string;
  customerEmail: string | null;
  customerEmailVerifiedAt?: Date | string | null;
};

/**
 * The customer's email, only when it can be relied on: the sender address of
 * an email conversation, or an address whose code was typed back. A widget
 * visitor's typed email is not: using it to find their tickets, to skip
 * approval on mail to "the customer" or to pass the sender allow-list would
 * let anyone act as anyone.
 */
export function trustedCustomerEmail(row: IdentityRow): string | null {
  if (!row.customerEmail) return null;
  if (row.channel === "email" || row.customerEmailVerifiedAt) return row.customerEmail;
  return null;
}

export const identityInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2, "Enter your name").max(80, "That name is too long")),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().max(254, "That email is too long").email("Enter a valid email address")),
});

export function clientIp(req: { headers: Headers }): string | null {
  // Behind Railway's proxy the last entry is the one the proxy itself added;
  // earlier ones can be whatever the client sent.
  const forwarded = req.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return last || req.headers.get("x-real-ip")?.trim() || null;
}

type ConversationRow = typeof conversations.$inferSelect;

/** Saves what the visitor said about themselves. Anything verified for a different address is cleared. */
export async function saveCustomerIdentity(input: {
  organizationId: string;
  conversation: Pick<ConversationRow, "id" | "customerEmail" | "customerEmailVerifiedAt">;
  name: string;
  email: string;
}): Promise<void> {
  const sameVerifiedEmail =
    Boolean(input.conversation.customerEmailVerifiedAt) && input.conversation.customerEmail?.toLowerCase() === input.email;
  await db
    .update(conversations)
    .set({
      customerName: input.name,
      customerEmail: input.email,
      identitySource: sameVerifiedEmail ? undefined : "widget_card",
      customerEmailVerifiedAt: sameVerifiedEmail ? undefined : null,
      updatedAt: new Date(),
    })
    .where(and(eq(conversations.id, input.conversation.id), eq(conversations.organizationId, input.organizationId)));
}

function codeSecret(): string | null {
  const configured = (process.env.IDENTITY_CODE_SECRET || process.env.ENCRYPTION_KEY || "").trim();
  if (configured) return configured;
  // Local development only: a deployment without a secret refuses to send codes.
  return (process.env.APP_ENV || "") === "local" ? "local-development-only-secret" : null;
}

function hashCode(secret: string, rowId: string, code: string): string {
  return createHmac("sha256", secret).update(`${rowId}:${code}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type CodeRequestResult =
  | { status: "sent"; resendInSeconds: number }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "failed"; reason: string };

/** Seconds until the oldest of `max` rows in a window ages out. */
function secondsUntilFree(oldest: Date, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((oldest.getTime() + windowMs - now) / 1000));
}

/**
 * Emails a fresh code to `email` for this conversation, unless a limit says no.
 * The limits are counted in Postgres from the code rows themselves, so they
 * hold across instances. Count and insert happen under a per-address lock, so
 * two requests at once can't both pass.
 */
export async function requestVerificationCode(input: {
  organizationId: string;
  conversationId: string;
  email: string;
  ip: string | null;
}): Promise<CodeRequestResult> {
  const secret = codeSecret();
  if (!secret) return { status: "failed", reason: "Verification isn't configured on this deployment." };

  const now = Date.now();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rowId = randomUUID();

  const decision = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`identity:${input.email}`}))`);

    const windowStart = (ms: number) => new Date(now - ms);
    const oldestSince = async (where: ReturnType<typeof and>, since: Date) => {
      const [row] = await tx
        .select({ at: emailVerificationCodes.createdAt })
        .from(emailVerificationCodes)
        .where(and(where, gte(emailVerificationCodes.createdAt, since)))
        .orderBy(emailVerificationCodes.createdAt)
        .limit(1);
      return row?.at ?? null;
    };
    const countSince = async (where: ReturnType<typeof and>, since: Date) => {
      const [row] = await tx
        .select({ n: count() })
        .from(emailVerificationCodes)
        .where(and(where, gte(emailVerificationCodes.createdAt, since)));
      return Number(row?.n ?? 0);
    };

    // 1. Resend cooldown, per conversation.
    const [latest] = await tx
      .select({ at: emailVerificationCodes.createdAt })
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.conversationId, input.conversationId))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);
    if (latest && now - latest.at.getTime() < IDENTITY_LIMITS.resendCooldownMs) {
      return { limitedFor: secondsUntilFree(latest.at, IDENTITY_LIMITS.resendCooldownMs, now) };
    }

    // 2. Sliding windows: per address, per client address, per organization.
    const byEmail = eq(emailVerificationCodes.email, input.email);
    for (const rule of IDENTITY_LIMITS.perEmail) {
      const since = windowStart(rule.windowMs);
      if ((await countSince(byEmail, since)) >= rule.max) {
        const oldest = (await oldestSince(byEmail, since)) ?? new Date(now);
        return { limitedFor: secondsUntilFree(oldest, rule.windowMs, now) };
      }
    }
    if (input.ip) {
      const byIp = eq(emailVerificationCodes.ip, input.ip);
      const since = windowStart(IDENTITY_LIMITS.perIp.windowMs);
      if ((await countSince(byIp, since)) >= IDENTITY_LIMITS.perIp.max) {
        const oldest = (await oldestSince(byIp, since)) ?? new Date(now);
        return { limitedFor: secondsUntilFree(oldest, IDENTITY_LIMITS.perIp.windowMs, now) };
      }
    }
    const byOrg = eq(emailVerificationCodes.organizationId, input.organizationId);
    const orgSince = windowStart(IDENTITY_LIMITS.perOrganization.windowMs);
    if ((await countSince(byOrg, orgSince)) >= IDENTITY_LIMITS.perOrganization.max) {
      const oldest = (await oldestSince(byOrg, orgSince)) ?? new Date(now);
      return { limitedFor: secondsUntilFree(oldest, IDENTITY_LIMITS.perOrganization.windowMs, now) };
    }

    await tx.insert(emailVerificationCodes).values({
      id: rowId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      email: input.email,
      ip: input.ip,
      codeHash: hashCode(secret, rowId, code),
      expiresAt: new Date(now + IDENTITY_LIMITS.codeTtlMs),
    });
    return { limitedFor: null };
  });

  if (decision.limitedFor !== null) return { status: "limited", retryAfterSeconds: decision.limitedFor };

  const delivered = await deliverCode(input.organizationId, input.email, code);
  if (!delivered.ok) {
    // A code nobody received shouldn't use up the visitor's quota.
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.id, rowId));
    return { status: "failed", reason: delivered.reason };
  }

  // Old rows have served their purpose as limit records.
  void db
    .delete(emailVerificationCodes)
    .where(lt(emailVerificationCodes.createdAt, new Date(now - 2 * 24 * 60 * 60 * 1000)))
    .catch(() => undefined);

  return { status: "sent", resendInSeconds: Math.ceil(IDENTITY_LIMITS.resendCooldownMs / 1000) };
}

async function deliverCode(organizationId: string, email: string, code: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const echo = (process.env.APP_ENV || "") === "local" && process.env.MIKE_DEV_ECHO_CODE === "true";
  const profile = await getOrCreateProfile(organizationId);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  try {
    await sendAsWorker({
      orgId: organizationId,
      to: [{ email }],
      subject: `Your ${profile.displayName} verification code`,
      body:
        `Your verification code is ${spaced}.\n\n` +
        `It expires in ${IDENTITY_LIMITS.codeTtlMs / 60000} minutes. If you didn't ask for it, you can ignore this email.`,
    });
    if (echo) console.info(`[identity] dev echo: code for ${email} is ${code}`);
    return { ok: true };
  } catch (error) {
    // Local development without a mailbox: read the code from the server log.
    if (echo) {
      console.info(`[identity] dev echo (no mailbox): code for ${email} is ${code}`);
      return { ok: true };
    }
    const reason =
      error instanceof OutboundBlocked
        ? error.reason === "no_mailbox"
          ? "No mailbox is connected, so a code can't be sent."
          : "This address can't be emailed from here."
        : "The code couldn't be sent.";
    console.warn("[identity] verification email failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason };
  }
}

export type CodeCheckResult =
  | { status: "verified"; email: string }
  | { status: "wrong"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "none" };

/** Checks a typed code against the newest unused one for this conversation. */
export async function verifyCode(input: { organizationId: string; conversationId: string; code: string }): Promise<CodeCheckResult> {
  const secret = codeSecret();
  const typed = input.code.replace(/\D/g, "");
  if (!secret || typed.length !== 6) return { status: "wrong", attemptsLeft: IDENTITY_LIMITS.maxAttempts };

  const [row] = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.conversationId, input.conversationId),
        eq(emailVerificationCodes.organizationId, input.organizationId),
        isNull(emailVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);
  if (!row) return { status: "none" };
  if (row.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  // Counted before it is compared, atomically, so parallel guesses can't beat the limit.
  const [counted] = await db
    .update(emailVerificationCodes)
    .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
    .where(and(eq(emailVerificationCodes.id, row.id), lt(emailVerificationCodes.attempts, IDENTITY_LIMITS.maxAttempts), isNull(emailVerificationCodes.consumedAt)))
    .returning({ attempts: emailVerificationCodes.attempts });
  if (!counted) return { status: "locked" };

  if (!safeEqualHex(hashCode(secret, row.id, typed), row.codeHash)) {
    const attemptsLeft = IDENTITY_LIMITS.maxAttempts - counted.attempts;
    if (attemptsLeft <= 0) {
      await db.update(emailVerificationCodes).set({ consumedAt: new Date() }).where(eq(emailVerificationCodes.id, row.id));
      return { status: "locked" };
    }
    return { status: "wrong", attemptsLeft };
  }

  await db.update(emailVerificationCodes).set({ consumedAt: new Date() }).where(eq(emailVerificationCodes.id, row.id));
  await db
    .update(conversations)
    .set({ customerEmail: row.email, customerEmailVerifiedAt: new Date(), identitySource: "email_code", updatedAt: new Date() })
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId)));
  return { status: "verified", email: row.email };
}
