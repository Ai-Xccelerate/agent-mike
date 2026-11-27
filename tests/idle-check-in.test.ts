import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, organizations, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { addInternalTicketNote, handoffTicketDescription, helpdeskRaisesTickets, recordHandoffInJira } from "@/lib/tools-integrations/atlassian";
import { runIdleCheckIn } from "@/lib/idle-check-in";
import { IDLE_CLOSE_TEXT, IDLE_NUDGE_TEXT, readIdleCheckIn } from "@/lib/idle-check-in-settings";
import { publicWorkerIdentity } from "@/lib/public-worker-identity";
import { applyWorkerPatch } from "@/lib/worker-settings";
import { POST as postIdle } from "@/app/api/v1/chat/idle/route";

vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => ({ key: "EESD-1", created: true })),
  addInternalTicketNote: vi.fn(async () => true),
  helpdeskRaisesTickets: vi.fn(async () => true),
  helpdeskTicketsEveryConversation: vi.fn(async () => false),
}));
vi.mock("@/lib/ticket-classifier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ticket-classifier")>()),
  summarizeForHandoff: vi.fn(async () => null),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const recordMock = vi.mocked(recordHandoffInJira);
const noteMock = vi.mocked(addInternalTicketNote);
const raisesMock = vi.mocked(helpdeskRaisesTickets);
const previousAdapter = getIdentityAdapter();

let orgId: string;

function adapterFor(org: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId: org, userId: "m", role: "owner", source: "test" }),
    resolveWidgetRequest: async (req) =>
      req.headers.get("x-worker-site-token") === "good" ? { orgId: org, userId: "widget", role: "member", source: "widget" } : null,
  };
}

async function setIdle(idleCheckIn: { enabled: boolean; nudgeAfterSeconds: number; closeAfterSeconds: number } | null) {
  const profile = await getOrCreateProfile(orgId);
  const { idleCheckIn: _drop, ...rest } = profile.channelsConfig;
  await db
    .update(workerProfiles)
    .set({ channelsConfig: idleCheckIn ? { ...rest, idleCheckIn } : rest })
    .where(eq(workerProfiles.organizationId, orgId));
}

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

/** A widget chat where the visitor asked and the worker answered `answeredSecondsAgo` seconds ago. */
async function chat(values: Partial<typeof conversations.$inferInsert> = {}, answeredSecondsAgo = 300) {
  const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", ...values });
  await db.insert(messages).values([
    { conversationId: conversation.id, senderType: "customer", senderName: "Visitor", body: "How do I reset my password?", createdAt: ago(answeredSecondsAgo + 5) },
    { conversationId: conversation.id, senderType: "agent", senderName: "Eva", body: "Open Settings, then Security, then Reset password.", createdAt: ago(answeredSecondsAgo) },
  ]);
  return conversation;
}

async function rows(conversationId: string) {
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
}

async function statusOf(conversationId: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return row;
}

/** Moves every message of the conversation back in time, as if the visitor had been quiet that long. */
async function age(conversationId: string, seconds: number) {
  const all = await rows(conversationId);
  for (const row of all) {
    await db.update(messages).set({ createdAt: new Date(row.createdAt.getTime() - seconds * 1000) }).where(eq(messages.id, row.id));
  }
}

function post(body: Record<string, unknown>, token = "good") {
  return new NextRequest("http://localhost/api/v1/chat/idle", {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-site-token": token },
    body: JSON.stringify(body),
    duplex: "half" as const,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

const json = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(async () => {
  orgId = `idle-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, orgId);
  await getOrCreateProfile(orgId);
  await setIdle({ enabled: true, nudgeAfterSeconds: 120, closeAfterSeconds: 120 });
  setIdentityAdapter(adapterFor(orgId));
  recordMock.mockClear();
  noteMock.mockClear();
  raisesMock.mockReset();
  raisesMock.mockResolvedValue(true);
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("idle check-in setting", () => {
  it("is off unless a manager turns it on, and fills in the defaults", () => {
    expect(readIdleCheckIn({ email: false, chat: true, voice: false })).toEqual({ enabled: false, nudgeAfterSeconds: 120, closeAfterSeconds: 120 });
    expect(readIdleCheckIn({ chat: true, idleCheckIn: { enabled: true } })).toEqual({ enabled: true, nudgeAfterSeconds: 120, closeAfterSeconds: 120 });
    expect(readIdleCheckIn({ idleCheckIn: "yes" }).enabled).toBe(false);
  });

  it("is saved through the worker patch, and a patch of the channel switches alone keeps it", async () => {
    const saved = await applyWorkerPatch(orgId, {
      channelsConfig: { email: false, chat: true, voice: false, idleCheckIn: { enabled: true, nudgeAfterSeconds: 180, closeAfterSeconds: 60 } },
    });
    expect(saved.ok).toBe(true);
    const kept = await applyWorkerPatch(orgId, { channelsConfig: { email: true, chat: true, voice: false } });
    expect(kept.ok && kept.profile.channelsConfig).toEqual({
      email: true,
      chat: true,
      voice: false,
      idleCheckIn: { enabled: true, nudgeAfterSeconds: 180, closeAfterSeconds: 60 },
    });
    const tooShort = await applyWorkerPatch(orgId, {
      channelsConfig: { email: false, chat: true, voice: false, idleCheckIn: { enabled: true, nudgeAfterSeconds: 5, closeAfterSeconds: 60 } },
    });
    expect(tooShort.ok).toBe(false);
  });

  it("is in the widget's public config", async () => {
    const profile = await getOrCreateProfile(orgId);
    expect(publicWorkerIdentity(profile).idleCheckIn).toEqual({ enabled: true, nudgeAfterSeconds: 120, closeAfterSeconds: 120 });
  });
});

describe("POST /api/v1/chat/idle", () => {
  it("rejects a missing site token and a bad stage", async () => {
    const conversation = await chat();
    expect((await postIdle(post({ conversation_id: conversation.id, stage: "nudge" }, "bad"))).status).toBe(401);
    expect((await postIdle(post({ conversation_id: conversation.id, stage: "later" }))).status).toBe(400);
  });

  it("is quietly not due when the setting is off", async () => {
    await setIdle(null);
    const conversation = await chat();
    const res = await postIdle(post({ conversation_id: conversation.id, stage: "nudge" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ due: false });
    expect(await rows(conversation.id)).toHaveLength(2);
  });

  it("does not find another organization's conversation", async () => {
    const otherOrg = `idle-other-${crypto.randomUUID()}`;
    await ensureOrganization(otherOrg, otherOrg);
    try {
      const other = await insertConversationWithTicket({ organizationId: otherOrg, channel: "widget" });
      expect((await postIdle(post({ conversation_id: other.id, stage: "nudge" }))).status).toBe(404);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, otherOrg));
    }
  });

  it("is not due before the time, and says how long is left", async () => {
    const conversation = await chat({}, 30);
    const body = await json(await postIdle(post({ conversation_id: conversation.id, stage: "nudge" })));
    expect(body.due).toBe(false);
    expect(body.due_in_seconds).toBeGreaterThan(80);
    expect(await rows(conversation.id)).toHaveLength(2);
  });

  it("posts the nudge once, however often it is asked", async () => {
    const conversation = await chat();
    const first = await json(await postIdle(post({ conversation_id: conversation.id, stage: "nudge" })));
    expect(first.due).toBe(true);
    expect(first.status).toBe("open");
    expect(first.message).toMatchObject({ senderType: "agent", body: IDLE_NUDGE_TEXT });
    expect(first.message.senderName).toBe((await getOrCreateProfile(orgId)).displayName);

    const again = await json(await postIdle(post({ conversation_id: conversation.id, stage: "nudge" })));
    expect(again.due).toBe(false);
    const together = await Promise.all([
      runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" }),
      runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" }),
    ]);
    expect(together.every((outcome) => outcome && !outcome.due)).toBe(true);
    expect((await rows(conversation.id)).filter((row) => row.body === IDLE_NUDGE_TEXT)).toHaveLength(1);
  });

  it("two first nudges at the same moment post once", async () => {
    const conversation = await chat();
    const together = await Promise.all([
      runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" }),
      runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" }),
    ]);
    expect(together.filter((outcome) => outcome?.due)).toHaveLength(1);
    expect((await rows(conversation.id)).filter((row) => row.body === IDLE_NUDGE_TEXT)).toHaveLength(1);
  });

  it("closes only after the nudge, and only once its own delay has passed", async () => {
    const conversation = await chat();
    // No nudge yet: nothing to close.
    expect((await json(await postIdle(post({ conversation_id: conversation.id, stage: "close" })))).due).toBe(false);

    expect((await json(await postIdle(post({ conversation_id: conversation.id, stage: "nudge" })))).due).toBe(true);
    // The nudge is brand new: too early to close.
    expect((await json(await postIdle(post({ conversation_id: conversation.id, stage: "close" })))).due).toBe(false);
    expect((await statusOf(conversation.id)).status).toBe("open");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("closes the chat, resolves it and logs it in Jira as answered and closed after no reply", async () => {
    const conversation = await chat();
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 121);

    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    expect(outcome?.due).toBe(true);
    if (!outcome?.due) throw new Error("not closed");
    expect(outcome.message.body).toBe(IDLE_CLOSE_TEXT);
    expect(outcome.status).toBe("resolved");
    await outcome.logged;

    expect((await statusOf(conversation.id)).status).toBe("resolved");
    expect(recordMock).toHaveBeenCalledTimes(1);
    const input = recordMock.mock.calls[0][0];
    expect(input).toMatchObject({ organizationId: orgId, answeredByWorker: true, closedAfterNoReply: true, latestMessage: "How do I reset my password?", workerReply: IDLE_CLOSE_TEXT });
    expect(input.transcript.at(-1)?.body).toBe(IDLE_NUDGE_TEXT);
    expect(handoffTicketDescription(input)).toContain("closed after no reply");
    expect(noteMock).not.toHaveBeenCalled();

    // Closed already: asking again does nothing.
    expect((await json(await postIdle(post({ conversation_id: conversation.id, stage: "close" })))).due).toBe(false);
    expect((await json(await postIdle(post({ conversation_id: conversation.id, stage: "nudge" })))).due).toBe(false);
    expect((await rows(conversation.id)).filter((row) => row.body === IDLE_CLOSE_TEXT)).toHaveLength(1);
  });

  it("answers the route with the close message and the resolved status", async () => {
    const conversation = await chat();
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 200);
    const body = await json(await postIdle(post({ conversation_id: conversation.id, stage: "close" })));
    expect(body).toMatchObject({ due: true, status: "resolved", message: { body: IDLE_CLOSE_TEXT, senderType: "agent" } });
  });

  it("adds a note to the ticket the chat already has instead of raising another", async () => {
    const conversation = await chat({ externalTicketKey: "EESD-42" });
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 121);
    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    if (!outcome?.due) throw new Error("not closed");
    await outcome.logged;
    expect(recordMock).not.toHaveBeenCalled();
    expect(noteMock).toHaveBeenCalledTimes(1);
    expect(noteMock.mock.calls[0][1]).toBe("EESD-42");
    expect(noteMock.mock.calls[0][2]).toMatch(/closed the chat/);
  });

  it("raises no ticket when Jira does not raise tickets", async () => {
    raisesMock.mockResolvedValue(false);
    const conversation = await chat();
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 121);
    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    if (!outcome?.due) throw new Error("not closed");
    await outcome.logged;
    expect((await statusOf(conversation.id)).status).toBe("resolved");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("skips the ticket for a visitor who has not said who they are when identity is required", async () => {
    await db.update(workerProfiles).set({ identityMode: "email_code" }).where(eq(workerProfiles.organizationId, orgId));
    const conversation = await chat();
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 121);
    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    if (!outcome?.due) throw new Error("not closed");
    await outcome.logged;
    expect((await statusOf(conversation.id)).status).toBe("resolved");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("raises it on behalf of a verified visitor", async () => {
    await db.update(workerProfiles).set({ identityMode: "email_code" }).where(eq(workerProfiles.organizationId, orgId));
    const conversation = await chat({ customerName: "Dana Reyes", customerEmail: "dana@example.com", customerEmailVerifiedAt: new Date() });
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 121);
    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    if (!outcome?.due) throw new Error("not closed");
    await outcome.logged;
    expect(recordMock.mock.calls[0][0].verifiedCustomer).toEqual({ email: "dana@example.com", name: "Dana Reyes" });
  });

  it("is never due while the team has the chat, a person took it over, or it is not the website chat", async () => {
    const waiting = await chat({ status: "needs_human" });
    const takenOver = await chat({ humanControlled: true });
    const playground = await chat({ channel: "chat" });
    const email = await chat({ channel: "email" });
    for (const conversation of [waiting, takenOver, playground, email]) {
      const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
      expect(outcome?.due).toBe(false);
      expect(await rows(conversation.id)).toHaveLength(2);
    }
  });

  it("waits for the visitor to say something, and for the worker to have spoken last", async () => {
    const silent = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.insert(messages).values({ conversationId: silent.id, senderType: "agent", senderName: "Eva", body: "Hi!", createdAt: ago(600) });
    expect((await runIdleCheckIn({ organizationId: orgId, conversationId: silent.id, stage: "nudge" }))?.due).toBe(false);

    const unanswered = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.insert(messages).values({ conversationId: unanswered.id, senderType: "customer", senderName: "Visitor", body: "Hello?", createdAt: ago(600) });
    expect((await runIdleCheckIn({ organizationId: orgId, conversationId: unanswered.id, stage: "nudge" }))?.due).toBe(false);
  });

  it("a visitor message after the nudge cancels the close", async () => {
    const conversation = await chat();
    await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "nudge" });
    await age(conversation.id, 300);
    await db.insert(messages).values({ conversationId: conversation.id, senderType: "customer", senderName: "Visitor", body: "Yes, one more thing", createdAt: ago(200) });
    const outcome = await runIdleCheckIn({ organizationId: orgId, conversationId: conversation.id, stage: "close" });
    expect(outcome?.due).toBe(false);
    expect((await statusOf(conversation.id)).status).toBe("open");
    expect(recordMock).not.toHaveBeenCalled();
  });
});
