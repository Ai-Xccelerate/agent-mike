import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, emailVerificationCodes, messages, organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { OutboundBlocked, sendAsWorker } from "@/lib/outbound";
import {
  IDENTITY_LIMITS,
  identityInputSchema,
  isPlaceholderCustomerName,
  normalizeIdentityMode,
  requestVerificationCode,
  saveCustomerIdentity,
  trustedCustomerEmail,
  verifyCode,
} from "@/lib/customer-identity";
import { identityRules } from "@/lib/agent";
import { runChatRequest } from "@/lib/chat-turn";
import { issueRememberToken } from "@/lib/remembered-customer";
import { recordHandoffInJira } from "@/lib/tools-integrations/atlassian";
import { POST as postIdentity } from "@/app/api/v1/chat/identity/route";
import { POST as postVerify } from "@/app/api/v1/chat/identity/verify/route";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound")>()),
  sendAsWorker: vi.fn(async () => ({ id: "sent-1", to: [], demo: false })),
}));
vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => null),
  lookupJiraCustomerByEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const sendMock = vi.mocked(sendAsWorker);
const recordMock = vi.mocked(recordHandoffInJira);
const previousAdapter = getIdentityAdapter();
const previousSecret = process.env.IDENTITY_CODE_SECRET;

let orgId: string;

function adapterFor(org: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId: org, userId: "m", role: "owner", source: "test" }),
    resolveWidgetRequest: async (req) =>
      req.headers.get("x-worker-site-token") === "good" ? { orgId: org, userId: "widget", role: "member", source: "widget" } : null,
  };
}

async function setMode(mode: string) {
  await getOrCreateProfile(orgId);
  await db.update(workerProfiles).set({ identityMode: mode }).where(eq(workerProfiles.organizationId, orgId));
}

async function widgetConversation(values: Partial<typeof conversations.$inferInsert> = {}) {
  return insertConversationWithTicket({ organizationId: orgId, channel: "widget", ...values });
}

/** The code the last email carried. */
function sentCode(): string {
  const body = String(sendMock.mock.calls.at(-1)?.[0].body ?? "");
  const match = body.match(/(\d{3}) (\d{3})/);
  if (!match) throw new Error("no code in the email");
  return `${match[1]}${match[2]}`;
}

function post(path: string, body: Record<string, unknown>, headers: Record<string, string> = { "x-worker-site-token": "good" }, extra: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers, ...extra },
    body: JSON.stringify(body),
    duplex: "half" as const,
  });
}

beforeEach(async () => {
  process.env.IDENTITY_CODE_SECRET = "test-secret";
  orgId = `identity-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await getOrCreateProfile(orgId);
  setIdentityAdapter(adapterFor(orgId));
  sendMock.mockClear();
  sendMock.mockResolvedValue({ id: "sent-1", to: [], demo: false });
  recordMock.mockClear();
  runAgentMock.mockReset();
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  if (previousSecret === undefined) delete process.env.IDENTITY_CODE_SECRET;
  else process.env.IDENTITY_CODE_SECRET = previousSecret;
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("who the visitor is", () => {
  it("treats the widget's stand-in names as placeholders, and a real name as one", () => {
    expect(isPlaceholderCustomerName("Website visitor")).toBe(true);
    expect(isPlaceholderCustomerName("Visitor 4821")).toBe(true);
    expect(isPlaceholderCustomerName(null)).toBe(true);
    expect(isPlaceholderCustomerName("Dana Reyes")).toBe(false);
    expect(isPlaceholderCustomerName("Visitor Services Ltd")).toBe(false);
  });

  it("trusts an email only when it is an email sender or a code came back for it", () => {
    expect(trustedCustomerEmail({ channel: "widget", customerEmail: "a@b.co", customerEmailVerifiedAt: null })).toBeNull();
    expect(trustedCustomerEmail({ channel: "widget", customerEmail: "a@b.co", customerEmailVerifiedAt: new Date() })).toBe("a@b.co");
    expect(trustedCustomerEmail({ channel: "email", customerEmail: "a@b.co" })).toBe("a@b.co");
    expect(trustedCustomerEmail({ channel: "widget", customerEmail: null, customerEmailVerifiedAt: new Date() })).toBeNull();
  });

  it("cleans and checks what the card sends", () => {
    expect(identityInputSchema.parse({ name: "  Dana   Reyes\n", email: " Dana@Example.COM " })).toEqual({ name: "Dana Reyes", email: "dana@example.com" });
    expect(identityInputSchema.safeParse({ name: "D", email: "dana@example.com" }).success).toBe(false);
    expect(identityInputSchema.safeParse({ name: "Dana", email: "not-an-email" }).success).toBe(false);
  });

  it("falls back to off for anything that isn't a mode", () => {
    expect(normalizeIdentityMode("email_code")).toBe("email_code");
    expect(normalizeIdentityMode("whatever")).toBe("off");
    expect(normalizeIdentityMode(undefined)).toBe("off");
  });
});

describe("what the worker is told about identity", () => {
  it("says nothing when the setting is off", () => {
    expect(identityRules({ name: null, email: null })).toBe("");
  });

  it("asks for details with the tag, and never hands over without them", () => {
    const text = identityRules({ name: null, email: null, identity: { mode: "email_match", verified: false } });
    expect(text).toContain("do not have both");
    expect(text).toContain("[[NEED_IDENTITY]]");
    expect(text).toContain("instead of [[ESCALATE]]");
  });

  it("holds back ticket details until a code has come back", () => {
    const unverified = identityRules({ name: "Dana", email: "d@e.co", identity: { mode: "email_code", verified: false } });
    expect(unverified).toContain("NOT verified");
    expect(unverified).toContain("share no ticket or account details");
    const verified = identityRules({ name: "Dana", email: "d@e.co", identity: { mode: "email_code", verified: true } });
    expect(verified).toContain("VERIFIED");
    expect(verified).not.toContain("share no ticket");
  });
});

describe("emailing a code", () => {
  it("sends one code, and keeps only its hash", async () => {
    const conversation = await widgetConversation();
    const result = await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: "1.1.1.1" });

    expect(result).toEqual({ status: "sent", resendInSeconds: 60 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toEqual([{ email: "dana@example.com" }]);
    const [row] = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.conversationId, conversation.id));
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.codeHash).not.toContain(sentCode());
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
  });

  it("makes a visitor wait before asking for another code for the same conversation", async () => {
    const conversation = await widgetConversation();
    await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: null });
    const again = await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: null });

    expect(again.status).toBe("limited");
    expect(again.status === "limited" && again.retryAfterSeconds).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("limits codes to one address across conversations, so a mailbox isn't spammed through the widget", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      const conversation = await widgetConversation();
      results.push(await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "victim@example.com", ip: `10.0.0.${i}` }));
    }
    expect(results.map((r) => r.status)).toEqual(["sent", "sent", "sent", "limited"]);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it("limits codes from one client address, so one person can't try many mailboxes", async () => {
    const results = [];
    for (let i = 0; i <= IDENTITY_LIMITS.perIp.max; i++) {
      const conversation = await widgetConversation();
      results.push(await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: `person${i}@example.com`, ip: "9.9.9.9" }));
    }
    expect(results.slice(0, -1).every((r) => r.status === "sent")).toBe(true);
    expect(results.at(-1)?.status).toBe("limited");
  });

  it("lets a limit lapse: an older request no longer counts once its window has passed", async () => {
    const first = await widgetConversation();
    await requestVerificationCode({ organizationId: orgId, conversationId: first.id, email: "dana@example.com", ip: null });
    await db
      .update(emailVerificationCodes)
      .set({ createdAt: new Date(Date.now() - IDENTITY_LIMITS.resendCooldownMs - 1000) })
      .where(eq(emailVerificationCodes.conversationId, first.id));

    const again = await requestVerificationCode({ organizationId: orgId, conversationId: first.id, email: "dana@example.com", ip: null });
    expect(again.status).toBe("sent");
  });

  it("sends only one code when two requests arrive at once", async () => {
    const conversation = await widgetConversation();
    const args = { organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: null };
    const results = await Promise.all([requestVerificationCode(args), requestVerificationCode(args)]);

    expect(results.map((r) => r.status).sort()).toEqual(["limited", "sent"]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("does not use up the visitor's quota when the email can't be sent", async () => {
    sendMock.mockRejectedValueOnce(new OutboundBlocked("No mailbox", [], "no_mailbox"));
    const conversation = await widgetConversation();
    const result = await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: null });

    expect(result).toEqual({ status: "failed", reason: "No mailbox is connected, so a code can't be sent." });
    const rows = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.conversationId, conversation.id));
    expect(rows).toHaveLength(0);
  });

  it("refuses to send when the deployment has no secret to sign codes with", async () => {
    delete process.env.IDENTITY_CODE_SECRET;
    const previousKey = process.env.ENCRYPTION_KEY;
    const previousEnv = process.env.APP_ENV;
    delete process.env.ENCRYPTION_KEY;
    process.env.APP_ENV = "production";
    try {
      const conversation = await widgetConversation();
      const result = await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email: "dana@example.com", ip: null });
      expect(result.status).toBe("failed");
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      if (previousKey !== undefined) process.env.ENCRYPTION_KEY = previousKey;
      process.env.APP_ENV = previousEnv;
    }
  });
});

describe("typing the code back", () => {
  async function codeFor(email = "dana@example.com") {
    const conversation = await widgetConversation({ customerEmail: email, customerName: "Dana Reyes" });
    await requestVerificationCode({ organizationId: orgId, conversationId: conversation.id, email, ip: null });
    return { conversation, code: sentCode() };
  }

  it("verifies the email on a right code, once", async () => {
    const { conversation, code } = await codeFor();

    const result = await verifyCode({ organizationId: orgId, conversationId: conversation.id, code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(result).toEqual({ status: "verified", email: "dana@example.com" });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row.customerEmailVerifiedAt).toBeInstanceOf(Date);
    expect(row.identitySource).toBe("email_code");

    // The same code can't be used again.
    expect((await verifyCode({ organizationId: orgId, conversationId: conversation.id, code })).status).toBe("none");
  });

  it("counts wrong guesses and burns the code on the last one, even if the next guess is right", async () => {
    const { conversation, code } = await codeFor();
    const wrong = code === "000000" ? "111111" : "000000";

    const lefts: number[] = [];
    for (let i = 0; i < IDENTITY_LIMITS.maxAttempts - 1; i++) {
      const r = await verifyCode({ organizationId: orgId, conversationId: conversation.id, code: wrong });
      expect(r.status).toBe("wrong");
      if (r.status === "wrong") lefts.push(r.attemptsLeft);
    }
    expect(lefts).toEqual([4, 3, 2, 1]);
    expect((await verifyCode({ organizationId: orgId, conversationId: conversation.id, code: wrong })).status).toBe("locked");
    expect((await verifyCode({ organizationId: orgId, conversationId: conversation.id, code })).status).toBe("none");
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row.customerEmailVerifiedAt).toBeNull();
  });

  it("refuses an expired code", async () => {
    const { conversation, code } = await codeFor();
    await db.update(emailVerificationCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailVerificationCodes.conversationId, conversation.id));

    expect((await verifyCode({ organizationId: orgId, conversationId: conversation.id, code })).status).toBe("expired");
  });

  it("only counts a code against the conversation and organization it was sent for", async () => {
    const { code } = await codeFor();
    const other = await widgetConversation();

    expect((await verifyCode({ organizationId: orgId, conversationId: other.id, code })).status).toBe("none");
  });

  it("clears a verified email when the visitor says a different one", async () => {
    const { conversation, code } = await codeFor();
    await verifyCode({ organizationId: orgId, conversationId: conversation.id, code });
    const [verified] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));

    await saveCustomerIdentity({ organizationId: orgId, conversation: verified, name: "Dana Reyes", email: "someone.else@example.com" });
    const [after] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(after.customerEmail).toBe("someone.else@example.com");
    expect(after.customerEmailVerifiedAt).toBeNull();

  });

  it("keeps it verified when the visitor says the same address again", async () => {
    const { conversation, code } = await codeFor();
    await verifyCode({ organizationId: orgId, conversationId: conversation.id, code });
    const [verified] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));

    await saveCustomerIdentity({ organizationId: orgId, conversation: verified, name: "Dana R.", email: "dana@example.com" });
    const [same] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(same.customerName).toBe("Dana R.");
    expect(same.customerEmailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/v1/chat/identity", () => {
  it("refuses a site token that isn't one", async () => {
    const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: "x", name: "Dana Reyes", email: "d@e.co" }, { "x-worker-site-token": "bad" }));
    expect(res.status).toBe(401);
  });

  it("refuses when customer identity is off", async () => {
    const conversation = await widgetConversation();
    const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "Dana Reyes", email: "d@e.co" }));
    expect(res.status).toBe(400);
  });

  it("explains what is wrong with the details", async () => {
    await setMode("email_match");
    const conversation = await widgetConversation();
    const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "D", email: "nope" }));
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toEqual({ name: "Enter your name", email: "Enter a valid email address" });
  });

  it("treats another organization's conversation as not found", async () => {
    await setMode("email_match");
    const otherOrg = `identity-other-${crypto.randomUUID()}`;
    await ensureOrganization(otherOrg, otherOrg);
    try {
      const foreign = await insertConversationWithTicket({ organizationId: otherOrg, channel: "widget" });
      const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: foreign.id, name: "Dana Reyes", email: "d@e.co" }));
      expect(res.status).toBe(404);
      const [row] = await db.select().from(conversations).where(eq(conversations.id, foreign.id));
      expect(row.customerEmail).toBeNull();
    } finally {
      await db.delete(organizations).where(eq(organizations.id, otherOrg));
    }
  });

  it("email_match: saves the details as given, unverified, and sends nothing", async () => {
    await setMode("email_match");
    const conversation = await widgetConversation();
    const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "Dana Reyes", email: "Dana@Example.com" }));

    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, mode: "email_match", next: "done", known_customer: true });
    expect(sendMock).not.toHaveBeenCalled();
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row).toMatchObject({ customerName: "Dana Reyes", customerEmail: "dana@example.com", identitySource: "widget_card", customerEmailVerifiedAt: null });
  });

  it("email_code: emails a code, then makes a quick resend wait", async () => {
    await setMode("email_code");
    const conversation = await widgetConversation();
    const body = { conversation_id: conversation.id, name: "Dana Reyes", email: "dana@example.com" };

    const first = await postIdentity(post("/api/v1/chat/identity", body));
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({ next: "code", resend_in: 60 });
    expect(sendMock).toHaveBeenCalledTimes(1);

    const again = await postIdentity(post("/api/v1/chat/identity", body));
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await json(again)).retry_after).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("email_code: says so when the email can't be sent, and saves nothing as verified", async () => {
    await setMode("email_code");
    sendMock.mockRejectedValueOnce(new OutboundBlocked("No mailbox", [], "no_mailbox"));
    const conversation = await widgetConversation();
    const res = await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "Dana Reyes", email: "dana@example.com" }));

    expect(res.status).toBe(502);
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row.customerEmailVerifiedAt).toBeNull();
  });

  it("limits by client address using the last forwarded hop, which the proxy added", async () => {
    await setMode("email_code");
    let last = 200;
    for (let i = 0; i <= IDENTITY_LIMITS.perIp.max; i++) {
      const conversation = await widgetConversation();
      const res = await postIdentity(
        post(
          "/api/v1/chat/identity",
          { conversation_id: conversation.id, name: "Dana Reyes", email: `p${i}@example.com` },
          { "x-worker-site-token": "good" },
          // The client can put anything first; only the last entry counts.
          { "x-forwarded-for": `${i}.${i}.${i}.${i}, 203.0.113.7` },
        ),
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/v1/chat/identity/verify", () => {
  it("verifies on the right code and reports attempts left on a wrong one", async () => {
    await setMode("email_code");
    const conversation = await widgetConversation();
    await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "Dana Reyes", email: "dana@example.com" }));
    const code = sentCode();
    const wrong = code === "000000" ? "111111" : "000000";

    const bad = await postVerify(post("/api/v1/chat/identity/verify", { conversation_id: conversation.id, code: wrong }));
    expect(bad.status).toBe(422);
    expect((await json(bad)).attempts_left).toBe(4);

    const good = await postVerify(post("/api/v1/chat/identity/verify", { conversation_id: conversation.id, code }));
    expect(good.status).toBe(200);
    const body = await json(good);
    expect(body).toMatchObject({ ok: true, verified: true, name: "Dana Reyes" });
    expect(typeof body.remember_token).toBe("string");
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row.customerEmailVerifiedAt).toBeInstanceOf(Date);
  });

  it("answers an expired code with 410", async () => {
    await setMode("email_code");
    const conversation = await widgetConversation();
    await postIdentity(post("/api/v1/chat/identity", { conversation_id: conversation.id, name: "Dana Reyes", email: "dana@example.com" }));
    await db.update(emailVerificationCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailVerificationCodes.conversationId, conversation.id));

    const res = await postVerify(post("/api/v1/chat/identity/verify", { conversation_id: conversation.id, code: sentCode() }));
    expect(res.status).toBe(410);
  });

  it("cannot verify another organization's conversation", async () => {
    const res = await postVerify(post("/api/v1/chat/identity/verify", { conversation_id: crypto.randomUUID(), code: "123456" }));
    expect(res.status).toBe(404);
  });
});

describe("a turn where the worker needs to know who this is", () => {
  async function turn(conversationId: string, body = "I want to report a bug") {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: conversation.customerName, body }).returning();
    return runCustomerTurn({
      organizationId: orgId,
      profile: await getOrCreateProfile(orgId),
      conversation,
      priorMessages: prior,
      userMessage,
      speakerName: conversation.customerName,
    });
  }
  const ask = { answer: "Happy to log that. Who am I speaking with?", confidence: 0.8, escalate: false, citations: [], needIdentity: true };

  it("shows the identity card to a visitor it knows nothing about", async () => {
    await setMode("email_code");
    runAgentMock.mockResolvedValue(ask);
    const conversation = await widgetConversation({ customerName: "Visitor 4821" });

    const result = await turn(conversation.id);
    const [stored] = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.senderType, "agent")));
    expect(stored.cards).toEqual([expect.objectContaining({ kind: "identity_request", data: { mode: "email_code" } })]);
    expect(result.result.escalate).toBe(false);
    // What the worker is told is built from the stored facts.
    expect(runAgentMock.mock.calls[0][10]).toEqual({ name: null, email: null, identity: { mode: "email_code", verified: false } });
  });

  it("does not show it again once the details are in (email_match), or the email is verified (email_code)", async () => {
    await setMode("email_match");
    runAgentMock.mockResolvedValue(ask);
    const given = await widgetConversation({ customerName: "Dana Reyes", customerEmail: "dana@example.com" });
    await turn(given.id);
    const [matchReply] = await db.select().from(messages).where(and(eq(messages.conversationId, given.id), eq(messages.senderType, "agent")));
    expect(matchReply.cards).toEqual([]);

    await setMode("email_code");
    const unverified = await widgetConversation({ customerName: "Dana Reyes", customerEmail: "dana@example.com" });
    await turn(unverified.id);
    const [stillAsks] = await db.select().from(messages).where(and(eq(messages.conversationId, unverified.id), eq(messages.senderType, "agent")));
    expect(stillAsks.cards).toEqual([expect.objectContaining({ kind: "identity_request", data: { mode: "email_code", name: "Dana Reyes", email: "dana@example.com" } })]);

    const verified = await widgetConversation({ customerName: "Dana Reyes", customerEmail: "dana@example.com", customerEmailVerifiedAt: new Date() });
    await turn(verified.id);
    const [done] = await db.select().from(messages).where(and(eq(messages.conversationId, verified.id), eq(messages.senderType, "agent")));
    expect(done.cards).toEqual([]);
  });

  it("never shows the card when the setting is off", async () => {
    runAgentMock.mockResolvedValue(ask);
    const conversation = await widgetConversation();
    await turn(conversation.id);
    const [reply] = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.senderType, "agent")));
    expect(reply.cards).toEqual([]);
  });

  it("raises the ticket on the customer's behalf only for an email a code came back for", async () => {
    await setMode("email_code");
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const typed = await widgetConversation({ customerName: "Dana Reyes", customerEmail: "dana@example.com" });
    await turn(typed.id);
    expect(recordMock.mock.calls.at(-1)?.[0].verifiedCustomer).toBeUndefined();

    const verified = await widgetConversation({ customerName: "Dana Reyes", customerEmail: "dana@example.com", customerEmailVerifiedAt: new Date() });
    await turn(verified.id);
    expect(recordMock.mock.calls.at(-1)?.[0].verifiedCustomer).toEqual({ email: "dana@example.com", name: "Dana Reyes" });
  });

  it("does not let a typed email pass the sender allow-list", async () => {
    await getOrCreateProfile(orgId);
    await db.update(workerProfiles).set({ allowedDomains: ["trusted.example"] }).where(eq(workerProfiles.organizationId, orgId));
    runAgentMock.mockResolvedValue({ answer: "Hello", confidence: 0.9, escalate: false, citations: [] });
    const conversation = await widgetConversation({ customerEmail: "attacker@trusted.example" });

    const result = await turn(conversation.id, "hi");
    expect(runAgentMock).not.toHaveBeenCalled();
    expect(result.result.escalate).toBe(true);
  });
});

void sql;

describe("a customer remembered on their device", () => {
  const ask = async (token: string | null) => {
    runAgentMock.mockResolvedValue({ answer: "Hello again.", confidence: 0.9, escalate: false, citations: [] });
    const req = post("/api/v1/chat", {});
    const outcome = await runChatRequest(req, { message: "hi, it's me again", ...(token ? { remember_token: token } : {}) });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, outcome.json.conversation_id as string));
    return { outcome, row };
  };

  it("starts a new conversation already verified, with no second code", async () => {
    await setMode("email_code");
    const token = issueRememberToken(orgId, { email: "dana@example.com", name: "Dana Reyes" })!;
    const { outcome, row } = await ask(token);
    expect(row).toMatchObject({ customerEmail: "dana@example.com", customerName: "Dana Reyes", identitySource: "email_code" });
    expect(row.customerEmailVerifiedAt).toBeInstanceOf(Date);
    expect(outcome.json.remembered).toEqual({ name: "Dana Reyes", email: "dana@example.com" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("is ignored when forged, from another organization, or when the setting no longer asks for a code", async () => {
    await setMode("email_code");
    for (const token of ["nonsense", issueRememberToken("some-other-org", { email: "dana@example.com", name: null })!]) {
      const { outcome, row } = await ask(token);
      expect(row.customerEmailVerifiedAt).toBeNull();
      expect(outcome.json.remembered).toBeUndefined();
    }
    await setMode("email_match");
    const { row } = await ask(issueRememberToken(orgId, { email: "dana@example.com", name: null })!);
    expect(row.customerEmailVerifiedAt).toBeNull();
  });
});
