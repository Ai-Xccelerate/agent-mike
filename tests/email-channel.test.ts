import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const runAgentMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const credentialsMock = vi.hoisted(() => vi.fn());
const getMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent")>();
  return { ...actual, runAgent: runAgentMock };
});
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/conversation-memory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conversation-memory")>();
  return { ...actual, maybeRefreshConversationSummary: vi.fn(async (_p: unknown, current: unknown) => current) };
});
vi.mock("@/lib/outbound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/outbound")>();
  return { ...actual, sendAsWorker: sendMock };
});
vi.mock("@/lib/nylas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nylas")>();
  return { ...actual, resolveNylasCredentials: credentialsMock, getMessage: getMessageMock };
});
// A real client, so the SDK's own signature check runs; parsing never calls out.
vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>();
  const { Composio } = await import("@composio/core");
  const client = new Composio({ apiKey: "test-key", allowTracking: false });
  return { ...actual, getComposioClient: () => client };
});

import { db } from "@/lib/db";
import {
  conversations,
  integrationConnections,
  messages,
  nylasMailboxes,
  organizations,
  workerProfiles,
} from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import {
  greetingName,
  processInboundEmail,
  receiveComposioWebhook,
  withGreeting,
  receiveNylasWebhook,
  type InboundOutcome,
} from "@/lib/email-channel";
import { POST as postManagerReply } from "@/app/api/v1/conversations/[id]/messages/route";
import { GET as webhookGet } from "@/app/api/v1/webhooks/nylas/route";

const SECRET = "whsec-test";
let orgId: string;
let grantId: string;
const previousAdapter = getIdentityAdapter();

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function delivery(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "message.created",
    data: {
      object: {
        id: `msg-${crypto.randomUUID()}`,
        grant_id: grantId,
        thread_id: "thread-1",
        subject: "Can't log in",
        from: [{ name: "Anna Customer", email: "Anna@Customer.com" }],
        to: [{ email: "mike@aiwkr.com" }],
        body: "<p>My password reset link never arrives.</p><p>On Mon, Mike wrote:</p><blockquote>&gt; old</blockquote>",
        snippet: "My password reset link never arrives.",
        folders: ["INBOX"],
        ...overrides,
      },
    },
  });
}

async function receive(body: string) {
  return receiveNylasWebhook(body, sign(body));
}

async function setProfile(values: Partial<typeof workerProfiles.$inferInsert>) {
  await db.update(workerProfiles).set(values).where(eq(workerProfiles.organizationId, orgId));
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  grantId = crypto.randomUUID();
  await ensureOrganization(orgId, "Email channel test");
  await getOrCreateProfile(orgId);
  await setProfile({ channelsConfig: { email: true, chat: true, voice: false }, managerEmail: "boss@aixccelerate.com" });
  await db.insert(nylasMailboxes).values({ organizationId: orgId, grantId, email: "mike@aiwkr.com", provider: "nylas", status: "connected" });
  credentialsMock.mockReset();
  credentialsMock.mockResolvedValue({
    source: "org",
    values: { clientId: "c", apiKey: "k", apiUri: "https://api.us.nylas.com", webhookSecret: SECRET },
  });
  runAgentMock.mockReset();
  runAgentMock.mockResolvedValue({ answer: "Check your spam folder.", confidence: 0.9, escalate: false, citations: [] });
  sendMock.mockReset();
  sendMock.mockResolvedValue({ id: "sent-1", to: [], demo: false });
  getMessageMock.mockReset();
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("receiving an email", () => {
  it("rejects a delivery signed with the wrong secret", async () => {
    const body = delivery();
    expect((await receiveNylasWebhook(body, sign(body, "someone-else"))).kind).toBe("rejected");
  });

  it("ignores a grant no organization has connected, and non-message events", async () => {
    const body = delivery({ grant_id: crypto.randomUUID() });
    expect((await receive(body)).kind).toBe("ignored");
    const calendar = JSON.stringify({ type: "event.created", data: { object: {} } });
    expect((await receive(calendar)).kind).toBe("ignored");
  });

  it("opens an email conversation for a new thread and stores only the new text", async () => {
    const outcome = await receive(delivery());
    expect(outcome.kind).toBe("stored");
    const stored = outcome as Extract<InboundOutcome, { kind: "stored" }>;

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation).toMatchObject({
      organizationId: orgId,
      channel: "email",
      customerEmail: "anna@customer.com",
      customerName: "Anna Customer",
      subject: "Can't log in",
      externalThreadId: "thread-1",
    });
    const [message] = await db.select().from(messages).where(eq(messages.id, stored.messageId));
    expect(message.body).toBe("My password reset link never arrives.");
  });

  it("treats a retried delivery as a duplicate and a reply in the thread as the same conversation", async () => {
    const body = delivery({ id: "msg-fixed" });
    const first = (await receive(body)) as Extract<InboundOutcome, { kind: "stored" }>;
    expect((await receive(body)).kind).toBe("duplicate");

    const second = (await receive(delivery({ id: "msg-next" }))) as Extract<InboundOutcome, { kind: "stored" }>;
    expect(second.conversationId).toBe(first.conversationId);
  });

  it("ignores the worker's own sent email", async () => {
    const outcome = await receive(delivery({ from: [{ email: "mike@aiwkr.com" }] }));
    expect(outcome).toMatchObject({ kind: "ignored" });
  });

  it("fetches the full message when the delivery is truncated", async () => {
    getMessageMock.mockResolvedValue({
      id: "msg-long",
      grantId,
      threadId: "thread-9",
      subject: "Long one",
      from: [{ email: "anna@customer.com", name: "Anna" }],
      to: [],
      body: "<p>The full text.</p>",
      snippet: "",
      folders: [],
    });
    const body = JSON.stringify({ type: "message.created.truncated", data: { object: { id: "msg-long", grant_id: grantId } } });
    const outcome = (await receive(body)) as Extract<InboundOutcome, { kind: "stored" }>;
    expect(outcome.kind).toBe("stored");
    const [message] = await db.select().from(messages).where(eq(messages.id, outcome.messageId));
    expect(message.body).toBe("The full text.");
  });
});

describe("answering an email", () => {
  async function storedEmail() {
    return (await receive(delivery())) as Extract<InboundOutcome, { kind: "stored" }>;
  }

  it("replies in the same thread and records the sent id", async () => {
    const stored = await storedEmail();
    await processInboundEmail(stored);

    expect(sendMock).toHaveBeenCalledWith({
      orgId,
      to: [{ email: "anna@customer.com", name: "Anna Customer" }],
      subject: "Re: Can't log in",
      body: "Hi Anna,\n\nCheck your spam folder.",
      replyToMessageId: stored.inboundMessageId,
      threadId: "thread-1",
    });
    const [agentReply] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, stored.conversationId), eq(messages.senderType, "agent")));
    expect(agentReply.externalMessageId).toBe("sent-1");
  });

  it("stays quiet once a human has taken over", async () => {
    const stored = await storedEmail();
    await db.update(conversations).set({ humanControlled: true }).where(eq(conversations.id, stored.conversationId));
    await processInboundEmail(stored);
    expect(runAgentMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("leaves email for a human when the Email channel is off", async () => {
    await setProfile({ channelsConfig: { email: false, chat: true, voice: false } });
    const stored = await storedEmail();
    await processInboundEmail(stored);
    expect(runAgentMock).not.toHaveBeenCalled();
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation.status).toBe("needs_human");
  });

  it("drafts but doesn't send when automatic replies are off", async () => {
    await setProfile({ autoReply: false });
    const stored = await storedEmail();
    await processInboundEmail(stored);
    expect(runAgentMock).toHaveBeenCalledOnce();
    expect(sendMock).not.toHaveBeenCalled();
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation.status).toBe("needs_human");
  });

  it("emails the manager a brief of the ticket when it hands over", async () => {
    process.env.PUBLIC_APP_URL = "https://console.example.com";
    runAgentMock.mockResolvedValue({ answer: "Bringing in a teammate.", confidence: 0.4, escalate: true, citations: [] });
    const stored = await storedEmail();
    await processInboundEmail(stored);
    delete process.env.PUBLIC_APP_URL;

    expect(sendMock).toHaveBeenCalledTimes(2);
    const handoff = sendMock.mock.calls[1][0] as { to: unknown; subject: string; body: string };
    expect(handoff.to).toEqual([{ email: "boss@aixccelerate.com", name: "Manager" }]);
    expect(handoff.subject).toMatch(/^Needs you: TCK-\d+ Can't log in$/);
    expect(handoff.body).toContain("Customer: Anna Customer <anna@customer.com>");
    expect(handoff.body).toContain("What the customer wrote:\nMy password reset link never arrives.");
    expect(handoff.body).toContain("replied:\nHi Anna,\n\nBringing in a teammate.");
    expect(handoff.body).toContain(`https://console.example.com/inbox?conversation=${stored.conversationId}`);
  });

  it("marks the conversation for a human when the reply can't be sent", async () => {
    sendMock.mockRejectedValueOnce(new Error("Nylas down"));
    const stored = await storedEmail();
    await processInboundEmail(stored);
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation.status).toBe("needs_human");
  });
});

describe("a manager replying from the Inbox", () => {
  function reply(conversationId: string, body: string) {
    setIdentityAdapter({
      resolveManagerRequest: async () => ({ orgId, userId: "manager-1", role: "admin", source: "test" }),
      resolveWidgetRequest: async () => null,
    });
    const req = new NextRequest(`http://localhost/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    return postManagerReply(req, { params: { id: conversationId } });
  }

  it("emails the customer in the thread and takes the conversation over", async () => {
    const stored = (await receive(delivery())) as Extract<InboundOutcome, { kind: "stored" }>;
    const res = await reply(stored.conversationId, "I've reset it for you.");
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "I've reset it for you.", replyToMessageId: stored.inboundMessageId }),
    );
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation.humanControlled).toBe(true);
  });

  it("saves nothing and says why when the email can't be sent", async () => {
    const stored = (await receive(delivery())) as Extract<InboundOutcome, { kind: "stored" }>;
    sendMock.mockRejectedValueOnce(new Error("Nylas down"));
    const res = await reply(stored.conversationId, "Hello?");
    expect(res.status).toBe(502);
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, stored.conversationId), eq(messages.senderType, "manager")));
    expect(rows).toHaveLength(0);
  });
});

describe("the webhook URL", () => {
  it("echoes Nylas's challenge", async () => {
    const res = await webhookGet(new NextRequest("http://localhost/api/v1/webhooks/nylas?challenge=abc123"));
    expect(await res.text()).toBe("abc123");
  });
});

describe("receiving a Gmail email through Composio", () => {
  const COMPOSIO_SECRET = "composio-whsec-test";
  const ACCOUNT = "ca_test_gmail";
  let previousSecret: string | undefined;

  beforeEach(async () => {
    previousSecret = process.env.COMPOSIO_WEBHOOK_SECRET;
    process.env.COMPOSIO_WEBHOOK_SECRET = COMPOSIO_SECRET;
    // This org receives through Gmail, not the Nylas mailbox the outer setup made.
    await db.delete(nylasMailboxes).where(eq(nylasMailboxes.organizationId, orgId));
    await db.delete(integrationConnections).where(eq(integrationConnections.composioConnectedAccountId, ACCOUNT));
    await db.insert(integrationConnections).values({
      organizationId: orgId,
      integrationType: "email",
      system: "gmail",
      composioAuthConfigId: "ac_test",
      composioConnectedAccountId: ACCOUNT,
      status: "active",
    });
    await setProfile({ email: "support@aixccelerate.com" });
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.COMPOSIO_WEBHOOK_SECRET;
    else process.env.COMPOSIO_WEBHOOK_SECRET = previousSecret;
  });

  function trigger(data: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}) {
    return JSON.stringify({
      id: `msg_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      type: "composio.trigger.message",
      metadata: {
        log_id: "log_1",
        trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
        trigger_id: "ti_1",
        connected_account_id: ACCOUNT,
        auth_config_id: "ac_test",
        user_id: orgId,
        ...metadata,
      },
      data: {
        message_id: `gm-${crypto.randomUUID()}`,
        thread_id: "gthread-1",
        sender: "Anna Customer <Anna@Customer.com>",
        to: "support@aixccelerate.com",
        subject: "Invoice question",
        message_text: "Why was I charged twice?\n\nOn Mon, Support wrote:\n> old",
        label_ids: ["INBOX", "UNREAD"],
        payload: { headers: [{ name: "Subject", value: "Invoice question" }] },
        ...data,
      },
    });
  }

  function signedRequest(body: string, secret = COMPOSIO_SECRET) {
    const id = `msg_${crypto.randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
    return new Request("http://localhost/api/v1/webhooks/composio", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
        "x-composio-webhook-version": "V3",
      },
    });
  }

  it("rejects a delivery signed with the wrong secret, or when no secret is configured", async () => {
    expect((await receiveComposioWebhook(signedRequest(trigger(), "wrong"))).kind).toBe("rejected");
    delete process.env.COMPOSIO_WEBHOOK_SECRET;
    expect((await receiveComposioWebhook(signedRequest(trigger()))).kind).toBe("rejected");
  });

  it("opens an email conversation for the Gmail thread and stores only the new text", async () => {
    const outcome = await receiveComposioWebhook(signedRequest(trigger()));
    expect(outcome.kind).toBe("stored");
    const stored = outcome as Extract<InboundOutcome, { kind: "stored" }>;
    expect(stored.organizationId).toBe(orgId);

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, stored.conversationId));
    expect(conversation).toMatchObject({
      channel: "email",
      customerName: "Anna Customer",
      customerEmail: "anna@customer.com",
      subject: "Invoice question",
      externalThreadId: "gthread-1",
    });
    const [message] = await db.select().from(messages).where(eq(messages.id, stored.messageId));
    expect(message.body).toBe("Why was I charged twice?");
  });

  it("treats a redelivery as a duplicate and a reply in the thread as the same conversation", async () => {
    const body = trigger({ message_id: "gm-fixed" });
    const first = (await receiveComposioWebhook(signedRequest(body))) as Extract<InboundOutcome, { kind: "stored" }>;
    expect((await receiveComposioWebhook(signedRequest(body))).kind).toBe("duplicate");
    const followUp = await receiveComposioWebhook(signedRequest(trigger({ message_text: "Any update?" })));
    expect(followUp).toMatchObject({ kind: "stored", conversationId: first.conversationId });
  });

  it("ignores accounts no organization connected, and deliveries naming another org", async () => {
    expect((await receiveComposioWebhook(signedRequest(trigger({}, { connected_account_id: "ca_unknown" })))).kind).toBe(
      "ignored",
    );
    expect((await receiveComposioWebhook(signedRequest(trigger({}, { user_id: "org-someone-else" })))).kind).toBe(
      "rejected",
    );
  });

  it("ignores its own sent mail and automated email", async () => {
    const cases = [
      trigger({ label_ids: ["SENT"] }),
      trigger({ sender: "Support <support@aixccelerate.com>" }),
      trigger({ sender: "Mail Delivery <mailer-daemon@googlemail.com>" }),
      trigger({ payload: { headers: [{ name: "Auto-Submitted", value: "auto-replied" }] } }),
    ];
    for (const body of cases) {
      expect((await receiveComposioWebhook(signedRequest(body))).kind).toBe("ignored");
    }
  });

  it("answers in the Gmail thread", async () => {
    const stored = (await receiveComposioWebhook(signedRequest(trigger()))) as Extract<InboundOutcome, { kind: "stored" }>;
    await processInboundEmail(stored);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        to: [{ email: "anna@customer.com", name: "Anna Customer" }],
        subject: "Re: Invoice question",
        threadId: "gthread-1",
      }),
    );
  });
});

describe("greeting the customer by name", () => {
  it("uses the first name from a display name", () => {
    expect(greetingName("Charan Naik")).toBe("Charan");
    expect(greetingName("Naik, Charan")).toBe("Charan");
    expect(greetingName('"anna"')).toBe("Anna");
  });

  it("has no name for an address, a role mailbox or the placeholder", () => {
    expect(greetingName("support")).toBeNull();
    expect(greetingName("billing")).toBeNull();
    expect(greetingName("anna@customer.com")).toBeNull();
    expect(greetingName("Email customer")).toBeNull();
    expect(greetingName("")).toBeNull();
  });

  it("opens the reply with the name, once", () => {
    expect(withGreeting("We refunded it.", "Charan Naik")).toBe("Hi Charan,\n\nWe refunded it.");
    expect(withGreeting("We refunded it.", "support")).toBe("Hi there,\n\nWe refunded it.");
    expect(withGreeting("Hi Charan,\n\nWe refunded it.", "Charan Naik")).toBe("Hi Charan,\n\nWe refunded it.");
    expect(withGreeting("Hello there! Done.", "Charan Naik")).toBe("Hello there! Done.");
  });

  it("stores the greeted reply, so the Inbox shows what was sent", async () => {
    const stored = (await receive(delivery())) as Extract<InboundOutcome, { kind: "stored" }>;
    await processInboundEmail(stored);
    const [agentReply] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, stored.conversationId), eq(messages.senderType, "agent")));
    expect(agentReply.body).toBe("Hi Anna,\n\nCheck your spam folder.");
  });
});
