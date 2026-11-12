import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { sendAsWorker } from "@/lib/outbound";
import { identityGateSatisfied } from "@/lib/customer-identity";
import { identityGateRequired } from "@/lib/identity-gate";
import { runChatRequest } from "@/lib/chat-turn";
import { issueRememberToken } from "@/lib/remembered-customer";
import { publicWorkerIdentity } from "@/lib/public-worker-identity";
import { POST as postIdentity } from "@/app/api/v1/chat/identity/route";

const runAgentMock = vi.hoisted(() => vi.fn());
const logEveryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outbound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound")>()),
  sendAsWorker: vi.fn(async () => ({ id: "sent-1", to: [], demo: false })),
}));
vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
// Jira is never reached: the settings question is answered by the mock and no ticket is ever raised.
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskTicketsEveryConversation: logEveryMock,
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

const post = (path: string, body: Record<string, unknown>) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-site-token": "good" },
    body: JSON.stringify(body),
    duplex: "half" as const,
  });

async function settings(values: Partial<typeof workerProfiles.$inferInsert>) {
  await db.update(workerProfiles).set(values).where(eq(workerProfiles.organizationId, orgId));
}

const ask = (extra: Record<string, unknown> = {}) => runChatRequest(post("/api/v1/chat", {}), { message: "How do I reset my password?", ...extra });

beforeEach(async () => {
  process.env.IDENTITY_CODE_SECRET = "test-secret";
  orgId = `gate-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await getOrCreateProfile(orgId);
  setIdentityAdapter(adapterFor(orgId));
  vi.mocked(sendAsWorker).mockClear();
  logEveryMock.mockReset();
  logEveryMock.mockResolvedValue(false);
  runAgentMock.mockReset();
  runAgentMock.mockResolvedValue({ answer: "Here are the steps.", confidence: 0.9, escalate: false, citations: [] });
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  if (previousSecret === undefined) delete process.env.IDENTITY_CODE_SECRET;
  else process.env.IDENTITY_CODE_SECRET = previousSecret;
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("when the details form comes first", () => {
  it("is not required by default: general questions are answered with no details", async () => {
    await settings({ identityMode: "email_code" });
    const profile = await getOrCreateProfile(orgId);
    expect(await identityGateRequired(orgId, profile)).toBe(false);
    expect((await ask()).status).toBe(200);
  });

  it("is required when every conversation is logged, and an identity check is on", async () => {
    logEveryMock.mockResolvedValue(true);
    await settings({ identityMode: "email_code" });
    expect(await identityGateRequired(orgId, await getOrCreateProfile(orgId))).toBe(true);
  });

  it("is required when user verification is required, and an identity check is on", async () => {
    await settings({ identityMode: "email_match", requireUserVerification: true });
    expect(await identityGateRequired(orgId, await getOrCreateProfile(orgId))).toBe(true);
  });

  it("is never required with the identity check off, because there is nothing to collect with", async () => {
    logEveryMock.mockResolvedValue(true);
    await settings({ identityMode: "off", requireUserVerification: true });
    expect(await identityGateRequired(orgId, await getOrCreateProfile(orgId))).toBe(false);
    expect((await ask()).status).toBe(200);
  });

  it("tells the widget, through the public identity", async () => {
    const profile = await getOrCreateProfile(orgId);
    expect(publicWorkerIdentity(profile, undefined, true).identityGate).toBe(true);
    expect(publicWorkerIdentity(profile).identityGate).toBe(false);
  });
});

describe("the chat refuses an unknown visitor while the form is required", () => {
  beforeEach(async () => {
    logEveryMock.mockResolvedValue(true);
    await settings({ identityMode: "email_code" });
  });

  it("answers nobody who has not started with their details, and creates nothing", async () => {
    const outcome = await ask();
    expect(outcome.status).toBe(403);
    expect(outcome.json.code).toBe("identity_required");
    expect(runAgentMock).not.toHaveBeenCalled();
    expect(await db.select().from(conversations).where(eq(conversations.organizationId, orgId))).toHaveLength(0);
  });

  it("refuses a conversation whose email has not been verified, even with a name and email typed in", async () => {
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerName: "Dana Reyes", customerEmail: "dana@example.com" });
    const outcome = await ask({ conversation_id: row.id });
    expect(outcome.status).toBe(403);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("answers once the email is verified", async () => {
    const row = await insertConversationWithTicket({
      organizationId: orgId,
      channel: "widget",
      customerName: "Dana Reyes",
      customerEmail: "dana@example.com",
      customerEmailVerifiedAt: new Date(),
    });
    expect((await ask({ conversation_id: row.id })).status).toBe(200);
  });

  it("lets a device remembered from a verified visit start a chat, and ignores a forged token", async () => {
    const token = issueRememberToken(orgId, { email: "dana@example.com", name: "Dana Reyes" })!;
    expect((await ask({ remember_token: token })).status).toBe(200);
    expect((await ask({ remember_token: "nonsense" })).status).toBe(403);
  });

  it("does not gate the manager's Playground", async () => {
    const outcome = await runChatRequest(
      new NextRequest("http://localhost/api/v1/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", duplex: "half" as const }),
      { message: "hello" },
    );
    expect(outcome.status).toBe(200);
  });
});

describe("the form starts the conversation", () => {
  it("creates an empty conversation for the details, and emails the code, only while the form is required", async () => {
    await settings({ identityMode: "email_code" });
    const refused = await postIdentity(post("/api/v1/chat/identity", { name: "Dana Reyes", email: "dana@example.com" }));
    expect(refused.status).toBe(404);
    expect(await db.select().from(conversations).where(eq(conversations.organizationId, orgId))).toHaveLength(0);

    logEveryMock.mockResolvedValue(true);
    const res = await postIdentity(post("/api/v1/chat/identity", { name: "Dana Reyes", email: "dana@example.com" }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ next: "code" });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, body.conversation_id));
    expect(row).toMatchObject({ customerName: "Dana Reyes", customerEmail: "dana@example.com", channel: "widget" });
    expect(row.customerEmailVerifiedAt).toBeNull();
    expect(vi.mocked(sendAsWorker)).toHaveBeenCalledTimes(1);
  });

  it("checks what the gate asks for from stored facts", () => {
    const base = { customerName: "Dana Reyes", customerEmail: "dana@example.com" };
    expect(identityGateSatisfied({ ...base, customerEmailVerifiedAt: null }, "email_code")).toBe(false);
    expect(identityGateSatisfied({ ...base, customerEmailVerifiedAt: new Date() }, "email_code")).toBe(true);
    expect(identityGateSatisfied({ ...base, customerEmailVerifiedAt: null }, "email_match")).toBe(true);
    expect(identityGateSatisfied({ customerName: "Visitor 4821", customerEmail: "dana@example.com" }, "email_match")).toBe(false);
    expect(identityGateSatisfied({ customerName: "Visitor 4821", customerEmail: null }, "off")).toBe(true);
  });
});
