import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { customerTickets } from "@/lib/customer-tickets";
import { customerStatusWord, referenceNotice, ticketReference } from "@/lib/ticket-reference";
import { helpdeskRaisesTickets, recordHandoffInJira } from "@/lib/tools-integrations/atlassian";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => null),
  helpdeskRaisesTickets: vi.fn(async () => false),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));

let orgId: string;

beforeEach(async () => {
  orgId = `org-tickets-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  runAgentMock.mockReset();
});

async function turn(conversationId: string, body: string, deferTicket = false) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Visitor", deferTicket });
}

describe("the reference a customer is given", () => {
  it("formats the reference and the status words", () => {
    expect(ticketReference("EAP", 1042)).toBe("EAP-1042");
    expect(ticketReference(null, 7)).toBe("TCK-7");
    expect(referenceNotice("EAP-1042")).toContain("EAP-1042");
    expect(customerStatusWord("needs_human")).toBe("With the support team");
    expect(customerStatusWord("resolved")).toBe("Resolved");
    expect(customerStatusWord("open")).toBe("Open");
  });

  it("is told to the customer on a handoff when no helpdesk ticket was raised", async () => {
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const result = await turn(conversation.id, "Our system is down");
    const prefix = (await getOrCreateProfile(orgId)).ticketPrefix;
    expect(result.reply.body).toContain(`logged this for the team as ${prefix}-${conversation.ticketNumber}`);
  });

  it("follows the reply as its own message with a card when the ticket is deferred (chat panel)", async () => {
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const result = await turn(conversation.id, "Our system is down", true);
    expect(result.reply.body).not.toContain("logged this");
    const followUp = await result.pendingTicket;
    const prefix = (await getOrCreateProfile(orgId)).ticketPrefix;
    expect(followUp?.message.body).toContain(`${prefix}-${conversation.ticketNumber}`);
    expect(JSON.stringify(followUp?.message.cards)).toContain(`${prefix}-${conversation.ticketNumber}`);
  });

  it("is not repeated when the customer writes again after the handoff", async () => {
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await turn(conversation.id, "Our system is down");
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
    const second = await turn(conversation.id, "Any news?");
    expect(second.reply.body).not.toContain("logged this");
  });
});

describe("a status check on a request already with the team", () => {
  it("adds nothing to the ticket and keeps the conversation with the team", async () => {
    runAgentMock.mockResolvedValue({ answer: "SUP-24 is with the support team.", confidence: 0.9, escalate: true, citations: [], checkedTickets: true });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
    vi.mocked(recordHandoffInJira).mockClear();
    const result = await turn(conversation.id, "Any update on my ticket?");
    expect(recordHandoffInJira).not.toHaveBeenCalled();
    expect(result.result.escalate).toBe(false);
    expect(result.status).toBe("needs_human");
    expect(result.reply.body).not.toContain("logged this");
  });

  it("still hands over when the customer is not just asking, or the conversation is not yet with the team", async () => {
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
    vi.mocked(recordHandoffInJira).mockClear();
    await turn(conversation.id, "It is still broken, now also the reports page");
    expect(recordHandoffInJira).toHaveBeenCalledTimes(1);

    runAgentMock.mockResolvedValue({ answer: "Checking.", confidence: 0.3, escalate: true, citations: [], checkedTickets: true });
    const fresh = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    vi.mocked(recordHandoffInJira).mockClear();
    await turn(fresh.id, "Check my ticket and also our system is down");
    expect(recordHandoffInJira).toHaveBeenCalledTimes(1);
  });
});

describe("checking a request's status", () => {
  it("returns this conversation's request with its reference and status", async () => {
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
    const tickets = await customerTickets(orgId, conversation.id, "EAP");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ reference: `EAP-${conversation.ticketNumber}`, status: "With the support team" });
  });

  it("shows other requests under the same email only when that email is trusted", async () => {
    const first = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com" });
    const second = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com" });
    // A typed address is not proof: the visitor sees only their own conversation.
    expect(await customerTickets(orgId, second.id, "EAP")).toHaveLength(1);
    await db.update(conversations).set({ customerEmailVerifiedAt: new Date() }).where(eq(conversations.id, second.id));
    const verified = await customerTickets(orgId, second.id, "EAP");
    expect(verified.map((t) => t.reference).sort()).toEqual([`EAP-${first.ticketNumber}`, `EAP-${second.ticketNumber}`].sort());
  });

  it("never shows another organization's requests", async () => {
    const other = `org-other-${crypto.randomUUID()}`;
    await ensureOrganization(other);
    const theirs = await insertConversationWithTicket({ organizationId: other, channel: "widget", customerEmail: "pat@example.com" });
    const mine = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com" });
    await db.update(conversations).set({ customerEmailVerifiedAt: new Date() }).where(eq(conversations.id, mine.id));
    const tickets = await customerTickets(orgId, mine.id, "EAP");
    // Both organizations number from 1001, so count rather than compare references: only their own request is returned.
    expect(tickets).toHaveLength(1);
    expect(await customerTickets(orgId, theirs.id, "EAP")).toEqual([]);
  });
});

describe("a customer chasing an earlier request by its number", () => {
  it("finds it in a new chat and shows only its status, never what it was about", async () => {
    const earlier = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", ticketSummary: "Someone's private login problem" });
    const fresh = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const found = await customerTickets(orgId, fresh.id, "EAP", `EAP-${earlier.ticketNumber}`);
    const quoted = found.find((ticket) => ticket.reference === `EAP-${earlier.ticketNumber}`);
    expect(quoted).toMatchObject({ status: "With the support team", about: null });
    // Also by the bare number, in any letter case.
    expect((await customerTickets(orgId, fresh.id, "EAP", `eap-${earlier.ticketNumber}`)).some((t) => t.reference === `EAP-${earlier.ticketNumber}`)).toBe(true);
    expect((await customerTickets(orgId, fresh.id, "EAP", String(earlier.ticketNumber))).some((t) => t.reference === `EAP-${earlier.ticketNumber}`)).toBe(true);
  });

  it("does not match another prefix, another organization, or a number that is not there", async () => {
    const earlier = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const otherOrg = `org-tickets-${crypto.randomUUID()}`;
    await ensureOrganization(otherOrg);
    const theirs = await insertConversationWithTicket({ organizationId: otherOrg, channel: "widget", ticketSummary: "Other client" });
    const fresh = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const refs = async (quoted: string) => (await customerTickets(orgId, fresh.id, "EAP", quoted)).map((t) => t.reference);
    expect(await refs(`ZZZ-${earlier.ticketNumber}`)).toEqual([`EAP-${fresh.ticketNumber}`]);
    expect(await refs("EAP-999999")).toEqual([`EAP-${fresh.ticketNumber}`]);
    const cross = await customerTickets(orgId, fresh.id, "EAP", `EAP-${theirs.ticketNumber + 5000}`);
    expect(cross.every((t) => t.about !== "Other client")).toBe(true);
  });
});

describe("a verified customer quoting their own number", () => {
  it("sees what it was about, but not on someone else's request or with an unchecked address", async () => {
    const earlier = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com", ticketSummary: "Login fails after update" });
    const checked = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com", customerEmailVerifiedAt: new Date() });
    const unchecked = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "pat@example.com" });
    const stranger = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerEmail: "other@example.com", customerEmailVerifiedAt: new Date() });
    const about = async (from: string) =>
      (await customerTickets(orgId, from, "EAP", `EAP-${earlier.ticketNumber}`)).find((t) => t.reference === `EAP-${earlier.ticketNumber}`)?.about;
    expect(await about(checked.id)).toBe("Login fails after update");
    expect(await about(unchecked.id)).toBeNull();
    expect(await about(stranger.id)).toBeNull();
  });
});

describe("a handover whose helpdesk ticket never came to be", () => {
  const answer = { answer: "Thanks, I'm passing that on.", confidence: 0.9, escalate: false, citations: [] };

  it("is raised on the customer's next message, and the number is given only then", async () => {
    runAgentMock.mockResolvedValue(answer);
    vi.mocked(helpdeskRaisesTickets).mockResolvedValue(true);
    vi.mocked(recordHandoffInJira).mockReset();
    vi.mocked(recordHandoffInJira).mockResolvedValue({ key: "SUP-90", created: true, title: "Reports blank" });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human" });
    const result = await turn(conversation.id, "hello? did you raise this?", true);
    const followUp = await result.pendingTicket;
    expect(recordHandoffInJira).toHaveBeenCalledTimes(1);
    expect(followUp?.message.body).toContain("SUP-90");
  });

  it("says nothing when the retry makes no ticket", async () => {
    runAgentMock.mockResolvedValue(answer);
    vi.mocked(helpdeskRaisesTickets).mockResolvedValue(true);
    vi.mocked(recordHandoffInJira).mockReset();
    vi.mocked(recordHandoffInJira).mockResolvedValue(null);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human" });
    const result = await turn(conversation.id, "any news?", true);
    expect(await result.pendingTicket).toBeNull();
    expect(result.reply.body).not.toContain("logged this");
  });

  it("is not tried when a ticket exists, the helpdesk refused one, or tickets are switched off", async () => {
    runAgentMock.mockResolvedValue(answer);
    vi.mocked(recordHandoffInJira).mockReset();
    vi.mocked(recordHandoffInJira).mockResolvedValue({ key: "SUP-91", created: true });
    vi.mocked(helpdeskRaisesTickets).mockResolvedValue(true);
    const hasKey = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-1" });
    const refused = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketError: "Refused" });
    await turn(hasKey.id, "any news?", true);
    await turn(refused.id, "any news?", true);
    expect(recordHandoffInJira).not.toHaveBeenCalled();
    vi.mocked(helpdeskRaisesTickets).mockResolvedValue(false);
    const off = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human" });
    await turn(off.id, "any news?", true);
    expect(recordHandoffInJira).not.toHaveBeenCalled();
  });
});

describe("a verified customer chasing an earlier request", () => {
  const chase = { answer: "I'm sorry nobody called. SUP-5 is still open; I'm passing on that you are chasing it.", confidence: 0.9, escalate: true, citations: [], checkedTickets: true, chasedTicketKey: "SUP-5" };

  it("adds the chase to that request and links the new conversation to it, instead of raising a second ticket", async () => {
    runAgentMock.mockResolvedValue(chase);
    vi.mocked(recordHandoffInJira).mockReset();
    vi.mocked(recordHandoffInJira).mockResolvedValue({ key: "SUP-5", created: false });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const result = await turn(conversation.id, "third time I'm writing about SUP-5, nobody called");
    const sent = vi.mocked(recordHandoffInJira).mock.calls[0][0];
    expect(sent.conversation.externalTicketKey).toBe("SUP-5");
    expect(result.reply.body).toContain("added this to your ticket SUP-5");
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(row.externalTicketKey).toBe("SUP-5");
  });

  it("changes nothing when the conversation already has its own ticket", async () => {
    runAgentMock.mockResolvedValue(chase);
    vi.mocked(recordHandoffInJira).mockReset();
    vi.mocked(recordHandoffInJira).mockResolvedValue({ key: "SUP-2", created: false });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", externalTicketKey: "SUP-2" });
    await turn(conversation.id, "still nothing on SUP-5");
    expect(vi.mocked(recordHandoffInJira).mock.calls[0][0].conversation.externalTicketKey).toBe("SUP-2");
  });
});
