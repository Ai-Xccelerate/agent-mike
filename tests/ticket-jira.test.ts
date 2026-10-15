import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { computeTickets } from "@/lib/tickets";
import { backfillFromJira, clearBackfillAttempts, jiraLinkFor, withTimeout } from "@/lib/ticket-jira";
import { clearJiraSiteCache, helpdeskBreakdownSource, readJiraTicketDetails } from "@/lib/tools-integrations/atlassian";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { getAccountSite, proxyRequest } from "@/lib/tools-integrations/composio-client";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { GET as getConversation } from "@/app/api/v1/conversations/[id]/route";

vi.mock("@/lib/tools-integrations/connection-repository", () => ({ getConnectionForOrg: vi.fn() }));
vi.mock("@/lib/tools-integrations/composio-client", () => ({
  executeTool: vi.fn(),
  getAccountSite: vi.fn(),
  proxyRequest: vi.fn(),
  getActionSchema: vi.fn(),
  searchActions: vi.fn(),
}));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskBreakdownSource: vi.fn(),
}));

const getConnectionMock = vi.mocked(getConnectionForOrg);
const siteMock = vi.mocked(getAccountSite);
const proxyMock = vi.mocked(proxyRequest);
const breakdownMock = vi.mocked(helpdeskBreakdownSource);
const previousAdapter = getIdentityAdapter();

const jira = (overrides: Partial<IntegrationConnection> = {}): IntegrationConnection => ({
  id: crypto.randomUUID(),
  organizationId: "org",
  integrationType: "helpdesk",
  system: "jira",
  composioAuthConfigId: "ac_jira",
  composioConnectedAccountId: "ca_jira",
  status: "active",
  connectedBy: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsed: null,
  ...overrides,
});

/** Answers like Jira: the site list, the request (with its type), and the issue's priority. */
function jiraKnows(ticket: { type?: string | null; priority?: string | null; requestStatus?: number } = {}) {
  proxyMock.mockImplementation(async ({ endpoint }) => {
    if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net/" }] };
    if (endpoint.includes("/servicedeskapi/request/")) {
      if ((ticket.requestStatus ?? 200) >= 400) return { status: ticket.requestStatus ?? 404, data: { errorMessage: "not found" } };
      return { status: 200, data: ticket.type ? { requestType: { id: "5", name: ticket.type } } : {} };
    }
    if (endpoint.includes("/rest/api/3/issue/")) return { status: 200, data: { fields: { priority: ticket.priority ? { name: ticket.priority } : null } } };
    return { status: 204, data: null };
  });
}

let orgId: string;

async function ticket(values: Partial<typeof conversations.$inferInsert> = {}) {
  return insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerName: "Dana", ...values });
}
async function reload(id: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  return row;
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Jira link org");
  getConnectionMock.mockReset();
  getConnectionMock.mockImplementation(async () => null);
  siteMock.mockReset();
  siteMock.mockResolvedValue("https://acme.atlassian.net/");
  proxyMock.mockReset();
  breakdownMock.mockReset();
  breakdownMock.mockResolvedValue(null);
  clearJiraSiteCache();
  clearBackfillAttempts();
});

afterEach(() => setIdentityAdapter(previousAdapter));

describe("readJiraTicketDetails", () => {
  it("reads the request type and priority Jira has for a ticket", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "Request a New Feature", priority: "Low" });
    expect(await readJiraTicketDetails(orgId, "EAPR-2")).toEqual({ requestType: "Request a New Feature", priority: "Low" });
    const endpoints = proxyMock.mock.calls.map((call) => call[0].endpoint);
    expect(endpoints.some((url) => url.includes("/servicedeskapi/request/EAPR-2?expand=requestType"))).toBe(true);
  });

  it("returns nulls for what Jira does not say, and for a ticket Jira refuses", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: null, priority: null });
    expect(await readJiraTicketDetails(orgId, "EAPR-2")).toEqual({ requestType: null, priority: null });
    jiraKnows({ requestStatus: 404, priority: "High" });
    expect(await readJiraTicketDetails(orgId, "EAPR-2")).toEqual({ requestType: null, priority: "High" });
  });

  it("is null with no helpdesk connected or a connection that is not active", async () => {
    expect(await readJiraTicketDetails(orgId, "EAPR-2")).toBeNull();
    getConnectionMock.mockResolvedValue(jira({ status: "disconnected" }));
    expect(await readJiraTicketDetails(orgId, "EAPR-2")).toBeNull();
  });
});

describe("backfillFromJira", () => {
  it("fills the request type and priority a Jira ticket is missing", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "Request a New Feature", priority: "Low" });
    const row = await ticket({ externalTicketKey: "EAPR-2" });
    expect(await backfillFromJira(row)).toEqual({ externalTicketType: "Request a New Feature", externalTicketPriority: "Low" });
    expect(await reload(row.id)).toMatchObject({ externalTicketType: "Request a New Feature", externalTicketPriority: "Low" });
  });

  it("never overwrites what is stored, and fills only the gap", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "Report a Bug", priority: "Critical" });
    const row = await ticket({ externalTicketKey: "EAPR-3", externalTicketType: "System Unavailable" });
    expect(await backfillFromJira(row)).toEqual({ externalTicketType: "System Unavailable", externalTicketPriority: "Critical" });
    expect((await reload(row.id)).externalTicketType).toBe("System Unavailable");
  });

  it("does nothing for a ticket with no Jira key or nothing missing, without asking Jira", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "X", priority: "Y" });
    expect(await backfillFromJira(await ticket())).toBeNull();
    expect(await backfillFromJira(await ticket({ externalTicketKey: "EAPR-4", externalTicketType: "T", externalTicketPriority: "P" }))).toBeNull();
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it("does not ask again for ten minutes when Jira had nothing to add, then tries again", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: null, priority: null });
    const row = await ticket({ externalTicketKey: "EAPR-5" });
    const start = Date.now();
    expect(await backfillFromJira(row, start)).toBeNull();
    const asked = proxyMock.mock.calls.length;
    expect(asked).toBeGreaterThan(0);
    expect(await backfillFromJira(row, start + 60_000)).toBeNull();
    expect(proxyMock.mock.calls.length).toBe(asked);

    jiraKnows({ type: "Report a Bug", priority: "High" });
    expect(await backfillFromJira(row, start + 11 * 60_000)).toEqual({ externalTicketType: "Report a Bug", externalTicketPriority: "High" });
  });

  it("leaves the ticket alone when Jira cannot be reached", async () => {
    getConnectionMock.mockResolvedValue(jira());
    proxyMock.mockRejectedValue(new Error("network down"));
    const row = await ticket({ externalTicketKey: "EAPR-6" });
    expect(await backfillFromJira(row)).toBeNull();
    expect(await reload(row.id)).toMatchObject({ externalTicketType: null, externalTicketPriority: null });
  });

  it("keeps a value a handoff stored while Jira was being asked", async () => {
    getConnectionMock.mockResolvedValue(jira());
    const row = await ticket({ externalTicketKey: "EAPR-7" });
    proxyMock.mockImplementation(async ({ endpoint }) => {
      if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "c", url: "https://acme.atlassian.net" }] };
      // The handoff lands while this call is in flight.
      await db.update(conversations).set({ externalTicketType: "Stored by handoff" }).where(eq(conversations.id, row.id));
      if (endpoint.includes("/servicedeskapi/request/")) return { status: 200, data: { requestType: { name: "From Jira" } } };
      return { status: 200, data: { fields: { priority: { name: "Medium" } } } };
    });
    await backfillFromJira(row);
    expect(await reload(row.id)).toMatchObject({ externalTicketType: "Stored by handoff", externalTicketPriority: "Medium" });
  });
});

describe("jiraLinkFor", () => {
  it("links to the ticket on the connected site, and asks Composio for the site only once", async () => {
    getConnectionMock.mockResolvedValue(jira());
    expect(await jiraLinkFor(orgId, "EAPR-2")).toBe("https://acme.atlassian.net/browse/EAPR-2");
    expect(await jiraLinkFor(orgId, "EAPR-9")).toBe("https://acme.atlassian.net/browse/EAPR-9");
    expect(siteMock).toHaveBeenCalledTimes(1);
  });

  it("is null with no ticket key, no helpdesk, or a site Jira cannot name; and retries after a failure", async () => {
    expect(await jiraLinkFor(orgId, null)).toBeNull();
    expect(await jiraLinkFor(orgId, "EAPR-2")).toBeNull();
    getConnectionMock.mockResolvedValue(jira());
    siteMock.mockRejectedValueOnce(new Error("composio down"));
    expect(await jiraLinkFor(orgId, "EAPR-2")).toBeNull();
    expect(await jiraLinkFor(orgId, "EAPR-2")).toBe("https://acme.atlassian.net/browse/EAPR-2");
  });

  it("encodes the key", async () => {
    getConnectionMock.mockResolvedValue(jira());
    expect(await jiraLinkFor(orgId, "A B/1")).toBe("https://acme.atlassian.net/browse/A%20B%2F1");
  });
});

describe("withTimeout", () => {
  it("returns the work's value, the fallback when it is slow, and the fallback when it throws", async () => {
    expect(await withTimeout(Promise.resolve("done"), 50, "late")).toBe("done");
    expect(await withTimeout(new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 200)), 20, "late")).toBe("late");
    expect(await withTimeout(Promise.reject(new Error("boom")), 50, "failed")).toBe("failed");
  });
});

describe("tickets list", () => {
  it("adds the Jira link to tickets that have a key, and none to those that do not", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "T", priority: "P" });
    await ticket({ externalTicketKey: "EAPR-2", externalTicketType: "T", externalTicketPriority: "P" });
    await ticket();
    const { tickets } = await computeTickets({ organizationId: orgId });
    const links = Object.fromEntries(tickets.map((t) => [t.externalTicketKey ?? "none", t.externalTicketUrl]));
    expect(links).toEqual({ "EAPR-2": "https://acme.atlassian.net/browse/EAPR-2", none: null });
  });

  it("starts filling a Jira ticket's missing type in the background, without waiting for it", async () => {
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "Request a New Feature", priority: "Low" });
    const row = await ticket({ externalTicketKey: "EAPR-2" });
    const first = await computeTickets({ organizationId: orgId });
    expect(first.tickets[0].externalTicketKey).toBe("EAPR-2");
    await vi.waitFor(async () => expect((await reload(row.id)).externalTicketType).toBe("Request a New Feature"));
    const second = await computeTickets({ organizationId: orgId });
    expect(second.tickets[0]).toMatchObject({ requestType: "Request a New Feature", priority: "Low" });
  });

  it("shows what a placeholder-named visitor typed about themselves, and nothing for a known customer", async () => {
    const visitor = await ticket({ customerName: "Website visitor" });
    await db.insert(messages).values([
      { conversationId: visitor.id, senderType: "customer", senderName: "Website visitor", body: "Could you add a pronouns field?", citations: [] },
      { conversationId: visitor.id, senderType: "agent", senderName: "Eva", body: "What is your name and email?", citations: [] },
      { conversationId: visitor.id, senderType: "customer", senderName: "Website visitor", body: "Dana Reyes, dana@riverside-counseling.example, Riverside Counseling.", citations: [] },
    ]);
    const known = await ticket({ customerName: "Sam Ortiz", customerEmail: "sam@example.com" });
    await db.insert(messages).values({ conversationId: known.id, senderType: "customer", senderName: "Sam Ortiz", body: "my name is Someone Else, x@y.com", citations: [] });

    const { tickets } = await computeTickets({ organizationId: orgId });
    const byId = Object.fromEntries(tickets.map((t) => [t.id, t]));
    expect(byId[visitor.id].customerStated).toEqual({ name: "Dana Reyes", email: "dana@riverside-counseling.example" });
    expect(byId[known.id].customerStated).toBeNull();
  });
});

describe("GET /api/v1/conversations/[id]", () => {
  function as(): IdentityAdapter {
    return {
      resolveManagerRequest: async () => ({ orgId, userId: "u", role: "admin", source: "test" }),
      resolveWidgetRequest: async () => null,
    };
  }
  const get = (id: string) => getConversation(new NextRequest(`http://localhost/api/v1/conversations/${id}`), { params: { id } });

  it("returns the Jira link, the backfilled type and priority, and what the visitor said", async () => {
    setIdentityAdapter(as());
    getConnectionMock.mockResolvedValue(jira());
    jiraKnows({ type: "Request a New Feature", priority: "Low" });
    const row = await ticket({ customerName: "Website visitor", externalTicketKey: "EAPR-2" });
    await db.insert(messages).values({ conversationId: row.id, senderType: "customer", senderName: "Website visitor", body: "my name is Dana Reyes, dana@riverside.example", citations: [] });

    const res = await get(row.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      externalTicketUrl: "https://acme.atlassian.net/browse/EAPR-2",
      externalTicketType: "Request a New Feature",
      externalTicketPriority: "Low",
      customerStated: { name: "Dana Reyes", email: "dana@riverside.example" },
    });
    // The verified fields are untouched: what a customer types is never promoted to them.
    expect(body.customerName).toBe("Website visitor");
    expect(body.customerEmail).toBeNull();
    expect((await reload(row.id)).customerEmail).toBeNull();
  });

  it("still returns the ticket, without a link, when no Jira is connected", async () => {
    setIdentityAdapter(as());
    const row = await ticket({ externalTicketKey: "EAPR-9" });
    const body = (await (await get(row.id)).json()) as Record<string, unknown>;
    expect(body.externalTicketUrl).toBeNull();
    expect(body.externalTicketType).toBeNull();
    expect(body.customerStated).toBeNull();
  });
});
