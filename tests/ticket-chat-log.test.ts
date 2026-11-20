import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { addChatNoteToTicket, handoffTicketNotice, notOnDeskNote, portalLinkFrom, recordHandoffInJira } from "@/lib/tools-integrations/atlassian";
import { referenceNotice } from "@/lib/ticket-reference";
import { chatTurnNote, logChatTurnOnTicket } from "@/lib/ticket-chat-log";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => ({ key: "SUP-7", created: false })),
  helpdeskRaisesTickets: vi.fn(async () => false),
  helpdeskTicketsEveryConversation: vi.fn(async () => false),
  setCriticalTicketPriority: vi.fn(async () => "Highest"),
  addInternalTicketNote: vi.fn(async () => true),
  addChatNoteToTicket: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));

let orgId: string;

beforeEach(async () => {
  orgId = `org-chatlog-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  runAgentMock.mockReset();
  vi.mocked(addChatNoteToTicket).mockReset();
  vi.mocked(addChatNoteToTicket).mockResolvedValue(true);
  vi.mocked(recordHandoffInJira).mockClear();
});

async function turn(conversationId: string, body: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
  const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Visitor", body }).returning();
  return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation, priorMessages: prior, userMessage, speakerName: "Visitor" });
}

const answer = { answer: "You can reset it under Settings.", confidence: 0.9, escalate: false, citations: [] };

describe("the chat after a ticket exists goes on the ticket", () => {
  it("adds what the customer wrote and what the worker answered", async () => {
    runAgentMock.mockResolvedValue(answer);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-7" });
    await turn(conversation.id, "Also, how do I reset my password?");
    await vi.waitFor(() => expect(addChatNoteToTicket).toHaveBeenCalledTimes(1));
    const [, key, text] = vi.mocked(addChatNoteToTicket).mock.calls[0];
    expect(key).toBe("SUP-7");
    expect(text).toContain("Also, how do I reset my password?");
    expect(text).toContain("You can reset it under Settings.");
    expect(text).toContain("website chat");
  });

  it("does not add a second note for a turn that already comments on the ticket as a handover", async () => {
    runAgentMock.mockResolvedValue({ ...answer, answer: "I've passed that to the team.", escalate: true });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "needs_human", externalTicketKey: "SUP-7" });
    await turn(conversation.id, "nobody can log in");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(addChatNoteToTicket).not.toHaveBeenCalled();
  });

  it("adds nothing to a conversation that has no ticket", async () => {
    runAgentMock.mockResolvedValue(answer);
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", status: "open" });
    await turn(conversation.id, "how do I reset my password?");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(addChatNoteToTicket).not.toHaveBeenCalled();
  });
});

describe("notes on a ticket", () => {
  it("names the channel, the customer and the worker, and keeps long messages short", () => {
    const note = chatTurnNote({ channel: "email", workerName: "Eva", customerMessage: "x".repeat(3000), workerReply: "Done." });
    expect(note).toContain("continued in email");
    expect(note).toContain("Customer:");
    expect(note).toContain("Eva:");
    expect(note.length).toBeLessThan(1700);
  });

  it("adds a ticket's notes one after the other, in order", async () => {
    const order: string[] = [];
    vi.mocked(addChatNoteToTicket).mockImplementation(async (_org, _key, text) => {
      const label = text.includes("first") ? "first" : "second";
      if (label === "first") await new Promise((resolve) => setTimeout(resolve, 40));
      order.push(label);
      return true;
    });
    const base = { organizationId: orgId, ticketKey: "SUP-1", channel: "widget", workerName: "Eva", workerReply: "ok" };
    await Promise.all([logChatTurnOnTicket({ ...base, customerMessage: "first" }), logChatTurnOnTicket({ ...base, customerMessage: "second" })]);
    expect(order).toEqual(["first", "second"]);
  });
});

describe("what the customer is told once a ticket exists", () => {
  it("always ends by asking whether there is anything else", () => {
    expect(handoffTicketNotice({ key: "SUP-1", created: true })).toMatch(/SUP-1.*Is there anything else I can help with\?$/);
    expect(handoffTicketNotice({ key: "SUP-1", created: false })).toMatch(/added this to your ticket SUP-1.*Is there anything else I can help with\?$/);
    expect(referenceNotice("TCK-4")).toMatch(/Is there anything else I can help with\?$/);
  });

  it("puts the portal address in the text only where there is no card to show it", () => {
    const ticket = { key: "SUP-1", created: true, url: "https://acme.atlassian.net/servicedesk/customer/portal/1/SUP-1" };
    expect(handoffTicketNotice(ticket)).not.toContain("https://");
    expect(handoffTicketNotice(ticket, { link: true })).toContain("You can see it here: https://acme.atlassian.net/servicedesk/customer/portal/1/SUP-1");
    expect(handoffTicketNotice({ key: "SUP-1", created: true }, { link: true })).not.toContain("https://");
  });

  it("takes the portal address from Jira's answer, and only a web address", () => {
    expect(portalLinkFrom({ _links: { web: "https://acme.atlassian.net/servicedesk/customer/portal/1/SUP-1" } })).toBe("https://acme.atlassian.net/servicedesk/customer/portal/1/SUP-1");
    expect(portalLinkFrom({ _links: { web: "javascript:alert(1)" } })).toBeNull();
    expect(portalLinkFrom({ _links: {} })).toBeNull();
    expect(portalLinkFrom(null)).toBeNull();
  });
});

describe("a verified customer who is not on the desk", () => {
  it("is offered an update in the chat, not a link, in the notice of a new ticket", () => {
    const notice = handoffTicketNotice({ key: "SUP-1", created: true, notOnDesk: true });
    expect(notice).toContain("You can ask me for an update on it here any time.");
    expect(notice).not.toContain("https://");
    expect(notice).toMatch(/Is there anything else I can help with\?$/);
  });

  it("is told nothing extra when it only added to a ticket, or the ticket was raised for them", () => {
    expect(handoffTicketNotice({ key: "SUP-1", created: false, notOnDesk: true })).not.toContain("update on it");
    expect(handoffTicketNotice({ key: "SUP-1", created: true, url: "https://acme.atlassian.net/servicedesk/customer/portal/1/SUP-1" })).not.toContain("update on it");
  });

  it("gives the team the email, and what to do about it", () => {
    const note = notOnDeskNote("dana@example.com");
    expect(note).toContain("Customer not on this desk: dana@example.com");
    expect(note).toContain("Add them under Customers");
    expect(note).toContain("participant or change the Reporter");
  });
});
