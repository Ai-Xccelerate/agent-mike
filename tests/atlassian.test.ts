import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { POST as postChat } from "@/app/api/v1/chat/route";
import {
  buildKnowledgeCql,
  CONFLUENCE_CQL_SEARCH_SLUG,
  ConfluenceKnowledgeError,
  customerTicketKeys,
  HANDOFF_TICKET_LABEL,
  handoffTicketSummary,
  issueKeyFrom,
  jiraSettingsProblem,
  listJiraProjects,
  JIRA_CREATE_ISSUE_SLUG,
  JIRA_GET_ISSUE_SLUG,
  lookupCustomerTickets,
  readConfluenceSettings,
  readJiraSettings,
  CONFLUENCE_GET_PAGES_SLUG,
  scorePage,
  recordHandoffInJira,
  searchConfluenceKnowledge,
  searchKeywords,
  serviceRequestTarget,
  JSM_REQUEST_TOOL_ID,
  type HandoffConversation,
} from "@/lib/tools-integrations/atlassian";
import { executeRunAction, executeSearchActions } from "@/lib/tools-integrations/composio-actions";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import {
  executeTool,
  getAccountSite,
  getActionSchema,
  proxyRequest,
  searchActions,
} from "@/lib/tools-integrations/composio-client";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tools-integrations/connection-repository", () => ({ getConnectionForOrg: vi.fn() }));
vi.mock("@/lib/tools-integrations/composio-client", () => ({
  executeTool: vi.fn(),
  getAccountSite: vi.fn(),
  proxyRequest: vi.fn(),
  getActionSchema: vi.fn(),
  searchActions: vi.fn(),
}));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));
vi.mock("@/lib/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent")>();
  return { ...actual, runAgent: runAgentMock };
});
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/conversation-memory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conversation-memory")>();
  return { ...actual, maybeRefreshConversationSummary: vi.fn(async (_profile, current) => current) };
});

const getConnectionMock = vi.mocked(getConnectionForOrg);
const executeToolMock = vi.mocked(executeTool);
const proxyRequestMock = vi.mocked(proxyRequest);
const getAccountSiteMock = vi.mocked(getAccountSite);
const getActionSchemaMock = vi.mocked(getActionSchema);
const searchActionsMock = vi.mocked(searchActions);

function connection(
  integrationType: string,
  system: string,
  overrides: Partial<IntegrationConnection> = {},
): IntegrationConnection {
  return {
    id: crypto.randomUUID(),
    organizationId: "org",
    integrationType,
    system,
    composioAuthConfigId: `ac_${system}`,
    composioConnectedAccountId: `ca_${system}`,
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

const jiraReady = (overrides: Partial<IntegrationConnection> = {}) =>
  connection("helpdesk", "jira", {
    metadata: { settings: { projectKey: "SUP", issueType: "Task", createTicketOnHandoff: true } },
    ...overrides,
  });

function connectionsFor(map: Record<string, IntegrationConnection | null>) {
  getConnectionMock.mockImplementation(async (_org, type) => map[type] ?? null);
}

/** Answers like Jira does: the site list, SUP's desk, then `post` to whatever is created or commented. */
function jiraAnswers(post: { status: number; data: unknown }, desks = [{ id: "1", projectKey: "SUP" }]) {
  proxyRequestMock.mockImplementation(async ({ endpoint, method }) => {
    if (endpoint.endsWith("/accessible-resources")) {
      return {
        status: 200,
        data: [
          { id: "cloud-other", url: "https://other.atlassian.net" },
          { id: "cloud-acme", url: "https://acme.atlassian.net/" },
        ],
      };
    }
    if (method === "GET" && endpoint.includes("/servicedeskapi/servicedesk")) return { status: 200, data: { values: desks } };
    if (method === "POST") return post;
    return { status: 204, data: null };
  });
}

let orgId: string;

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Atlassian test org");
  getConnectionMock.mockReset();
  getConnectionMock.mockResolvedValue(null);
  executeToolMock.mockReset();
  proxyRequestMock.mockReset();
  getAccountSiteMock.mockReset();
  getAccountSiteMock.mockResolvedValue("https://acme.atlassian.net");
  getActionSchemaMock.mockReset();
  searchActionsMock.mockReset();
  runAgentMock.mockReset();
});

afterEach(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

async function newConversation(values: Partial<typeof conversations.$inferInsert> = {}) {
  return insertConversationWithTicket({ organizationId: orgId, channel: "chat", ...values });
}

function handoffConversation(row: typeof conversations.$inferSelect): HandoffConversation {
  return { ...row };
}

describe("connection settings", () => {
  it("defaults when nothing is stored, and ignores anything that doesn't validate", () => {
    expect(readJiraSettings({})).toEqual({
      projectKey: null,
      issueType: null,
      requestTypeId: null,
      requestTypeName: null,
      createTicketOnHandoff: true,
    });
    expect(readJiraSettings({ settings: { projectKey: "not a key!" } }).projectKey).toBeNull();
    expect(readConfluenceSettings(null)).toEqual({ spaceKey: null, searchBeforeAnswering: true });
  });

  it("upper-cases a Jira project key", () => {
    expect(readJiraSettings({ settings: { projectKey: "sup", issueType: "Task" } }).projectKey).toBe("SUP");
  });
});

describe("raising a Jira ticket on handoff", () => {
  it("does nothing when Jira isn't connected or has no project set", async () => {
    const row = await newConversation();
    const input = {
      organizationId: orgId,
      workerName: "Mike",
      conversation: handoffConversation(row),
      transcript: [],
      latestMessage: "help",
    };
    expect(await recordHandoffInJira(input)).toBeNull();

    connectionsFor({ helpdesk: connection("helpdesk", "jira") });
    expect(await recordHandoffInJira(input)).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("creates the issue in the configured project and records its key on the conversation", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { id: "10001", key: "SUP-7" } });
    const row = await newConversation({ customerName: "Ana", customerEmail: "ana@example.com" });

    const result = await recordHandoffInJira({
      organizationId: orgId,
      workerName: "Mike",
      conversation: handoffConversation(row),
      transcript: [
        { speaker: "Ana", body: "My invoice shows the wrong amount" },
        { speaker: "Mike", body: "Let me check." },
      ],
      latestMessage: "My invoice shows the wrong amount",
    });

    expect(result).toEqual({ key: "SUP-7", created: true });
    const [slug, args, options] = executeToolMock.mock.calls[0];
    expect(slug).toBe(JIRA_CREATE_ISSUE_SLUG);
    expect(args).toMatchObject({
      project_key: "SUP",
      issue_type: "Task",
      summary: "My invoice shows the wrong amount",
      labels: [HANDOFF_TICKET_LABEL],
    });
    expect(String(args.description)).toContain("ana@example.com");
    expect(String(args.description)).toContain("**Ana:** My invoice shows the wrong amount");
    expect(options).toMatchObject({ connectedAccountId: "ca_jira", userId: orgId });

    const [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(stored.externalTicketKey).toBe("SUP-7");
  });

  it("comments on the existing ticket instead of opening a second one", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    jiraAnswers({ status: 201, data: {} });
    const row = await newConversation({ externalTicketKey: "SUP-7" });

    const result = await recordHandoffInJira({
      organizationId: orgId,
      workerName: "Mike",
      conversation: handoffConversation(row),
      transcript: [],
      latestMessage: "Still broken",
    });

    expect(result).toEqual({ key: "SUP-7", created: false });
    expect(executeToolMock).not.toHaveBeenCalled();
    const comment = proxyRequestMock.mock.calls.find(([call]) => call.method === "POST")![0];
    expect(comment.endpoint).toBe("https://api.atlassian.com/ex/jira/cloud-acme/rest/api/2/issue/SUP-7/comment");
    expect(String((comment.body as { body: string }).body)).toContain("Still broken");
  });

  it("puts the worker's handoff summary on the ticket, not only the customer's message", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-8" } });
    const summary = "Here's what I've passed to the support team:\n- Product: EAPx Cloud";

    const first = await newConversation();
    await recordHandoffInJira({
      organizationId: orgId,
      workerName: "Eva",
      conversation: handoffConversation(first),
      transcript: [{ speaker: "Ana", body: "Dashboard counts are wrong for everyone" }],
      latestMessage: "Dashboard counts are wrong for everyone",
      workerReply: summary,
    });
    expect(String(executeToolMock.mock.calls[0][1].description)).toContain(`**Eva:** ${summary}`);

    jiraAnswers({ status: 201, data: {} });
    const second = await newConversation({ externalTicketKey: "SUP-8" });
    await recordHandoffInJira({
      organizationId: orgId,
      workerName: "Eva",
      conversation: handoffConversation(second),
      transcript: [],
      latestMessage: "ana@acmeeap.com",
      workerReply: summary,
    });
    const comment = String((proxyRequestMock.mock.calls.find(([call]) => call.method === "POST")![0].body as { body: string }).body);
    expect(comment).toContain("ana@acmeeap.com");
    expect(comment).toContain(`Eva replied:\n\n${summary}`);
  });

  it("records Jira's reason on the conversation when it refuses, and clears it once a ticket goes through", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({
      successful: false,
      error: "Issue type 'Support' is not valid for project 'SUP'.",
      data: {},
    });
    const row = await newConversation();
    const input = {
      organizationId: orgId,
      workerName: "Mike",
      conversation: handoffConversation(row),
      transcript: [],
      latestMessage: "help",
    };

    expect(await recordHandoffInJira(input)).toEqual({ failed: "Issue type 'Support' is not valid for project 'SUP'." });
    let [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(stored.externalTicketKey).toBeNull();
    expect(stored.externalTicketError).toBe("Issue type 'Support' is not valid for project 'SUP'.");

    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-9" } });
    expect(await recordHandoffInJira(input)).toEqual({ key: "SUP-9", created: true });
    [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
    expect(stored.externalTicketKey).toBe("SUP-9");
    expect(stored.externalTicketError).toBeNull();
  });

  it("lists projects with the issue types a ticket can be raised as, and says what's wrong with a bad pair", async () => {
    executeToolMock.mockResolvedValue({
      successful: true,
      error: null,
      data: {
        projects: [
          {
            key: "SUP",
            name: "Support",
            issueTypes: [
              { name: "[System] Service request" },
              { name: "Task" },
              { name: "Sub-task", subtask: true },
            ],
          },
        ],
      },
    });
    const projects = await listJiraProjects(orgId, "ca_jira");
    expect(projects).toEqual([{ key: "SUP", name: "Support", issueTypes: ["[System] Service request", "Task"] }]);
    expect(jiraSettingsProblem(projects!, "SUP", "Task")).toBeNull();
    expect(jiraSettingsProblem(projects!, "SUP", "Support")).toBe(
      '"Support" isn\'t an issue type in SUP. Choose one of: [System] Service request, Task.',
    );
    expect(jiraSettingsProblem(projects!, "NOPE", "Task")).toContain("There's no project NOPE");
  });

  describe("as a Jira Service Management request", () => {
    const API = "https://api.atlassian.com/ex/jira/cloud-acme";
    const jsmReady = () =>
      connection("helpdesk", "jira", {
        metadata: {
          settings: {
            projectKey: "SUP",
            issueType: null,
            requestTypeId: "8",
            requestTypeName: "Report a system problem",
            createTicketOnHandoff: true,
          },
        },
      });


    it("raises it through the request API on the connection's own site, so it lands in the desk's queues", async () => {
      connectionsFor({ helpdesk: jsmReady() });
      jiraAnswers({ status: 201, data: { issueKey: "SUP-12", requestTypeId: "8" } });
      const row = await newConversation({ customerName: "Ana", customerEmail: "ana@example.com" });

      const result = await recordHandoffInJira({
        organizationId: orgId,
        workerName: "Eva",
        conversation: handoffConversation(row),
        transcript: [{ speaker: "Ana", body: "The dashboard shows the wrong case counts" }],
        latestMessage: "The dashboard shows the wrong case counts",
      });

      expect(result).toEqual({ key: "SUP-12", created: true });
      expect(executeToolMock).not.toHaveBeenCalled();
      const create = proxyRequestMock.mock.calls.find(([call]) => call.method === "POST")![0];
      expect(create.endpoint).toBe(`${API}/rest/servicedeskapi/request`);
      expect(create.connectedAccountId).toBe("ca_jira");
      const body = create.body as { serviceDeskId: string; requestTypeId: string; requestFieldValues: Record<string, string> };
      expect(body).toMatchObject({ serviceDeskId: "1", requestTypeId: "8" });
      expect(body.requestFieldValues.summary).toBe("The dashboard shows the wrong case counts");
      // Jira's wiki markup, not Markdown.
      expect(body.requestFieldValues.description).toContain("*Customer:* Ana <ana@example.com>");
      expect(body.requestFieldValues.description).not.toContain("**");

      const label = proxyRequestMock.mock.calls.find(([call]) => call.method === "PUT")![0];
      expect(label).toMatchObject({
        endpoint: `${API}/rest/api/3/issue/SUP-12`,
        body: { update: { labels: [{ add: HANDOFF_TICKET_LABEL }] } },
      });
      expect(vi.mocked(logToolCall)).toHaveBeenCalledWith(
        expect.objectContaining({ toolId: JSM_REQUEST_TOOL_ID, status: "success" }),
      );
      const [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
      expect(stored.externalTicketKey).toBe("SUP-12");
    });

    it("adds a later handoff as an internal note, falling back to a comment on a ticket that isn't a request", async () => {
      connectionsFor({ helpdesk: jsmReady() });
      jiraAnswers({ status: 201, data: {} });
      const row = await newConversation({ externalTicketKey: "SUP-12" });
      const input = {
        organizationId: orgId,
        workerName: "Eva",
        conversation: handoffConversation(row),
        transcript: [],
        latestMessage: "Still wrong this morning",
      };

      expect(await recordHandoffInJira(input)).toEqual({ key: "SUP-12", created: false });
      const posts = () => proxyRequestMock.mock.calls.filter(([call]) => call.method === "POST").map(([call]) => call);
      expect(posts()).toHaveLength(1);
      expect(posts()[0]).toMatchObject({
        endpoint: `${API}/rest/servicedeskapi/request/SUP-12/comment`,
        body: { public: false },
      });

      proxyRequestMock.mockClear();
      proxyRequestMock.mockImplementation(async ({ endpoint, method }) => {
        if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] };
        if (method === "POST" && endpoint.includes("/servicedeskapi/")) return { status: 404, data: { errorMessage: "Not a request" } };
        return { status: 201, data: {} };
      });
      expect(await recordHandoffInJira(input)).toEqual({ key: "SUP-12", created: false });
      expect(posts().map((call) => call.endpoint)).toEqual([
        `${API}/rest/servicedeskapi/request/SUP-12/comment`,
        `${API}/rest/api/2/issue/SUP-12/comment`,
      ]);
    });

    it("records Jira's reason when the request is refused", async () => {
      connectionsFor({ helpdesk: jsmReady() });
      jiraAnswers({ status: 400, data: { errorMessage: "Field 'customfield_10050' is required." } });
      const row = await newConversation();

      const result = await recordHandoffInJira({
        organizationId: orgId,
        workerName: "Eva",
        conversation: handoffConversation(row),
        transcript: [],
        latestMessage: "help",
      });

      expect(result).toEqual({ failed: "Field 'customfield_10050' is required." });
      expect(proxyRequestMock.mock.calls.some(([call]) => call.method === "PUT")).toBe(false);
      const [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
      expect(stored.externalTicketKey).toBeNull();
      expect(stored.externalTicketError).toBe("Field 'customfield_10050' is required.");
    });

    it("fails visibly when the project isn't a service desk", async () => {
      connectionsFor({ helpdesk: jsmReady() });
      jiraAnswers({ status: 201, data: { issueKey: "SUP-1" } }, [{ id: "2", projectKey: "OPS" }]);
      const row = await newConversation();

      const result = await recordHandoffInJira({
        organizationId: orgId,
        workerName: "Eva",
        conversation: handoffConversation(row),
        transcript: [],
        latestMessage: "help",
      });

      expect(result).toEqual({ failed: "SUP isn't a Jira Service Management project" });
      expect(proxyRequestMock.mock.calls.some(([call]) => call.method === "POST")).toBe(false);
    });

    it("says what's wrong with a project/request type pair", () => {
      const desks = [{ id: "1", projectKey: "SUP", requestTypes: [{ id: "8", name: "Report a system problem" }] }];
      expect(serviceRequestTarget(desks, "SUP", "8")).toEqual({ name: "Report a system problem" });
      expect(serviceRequestTarget(desks, "SUP", "99")).toEqual({
        problem: "That request type isn't in SUP. Choose one of: Report a system problem.",
      });
      expect(serviceRequestTarget(desks, "OPS", "8")).toEqual({
        problem: "OPS isn't a Jira Service Management project, so it has no request types.",
      });
    });
  });

  it("titles the ticket with what the customer came about, not their last answer", () => {
    const conversation = { subject: null } as HandoffConversation;
    const transcript = [
      { speaker: "Ana", body: "hi" },
      { speaker: "Eva", body: "Hi! How can I help?" },
      { speaker: "Ana", body: "The EAPx dashboard shows the wrong case counts" },
      { speaker: "Eva", body: "What's your work email?" },
      { speaker: "Ana", body: "ana@acme.com" },
    ];
    expect(handoffTicketSummary({ conversation, transcript, latestMessage: "ana@acme.com", workerName: "Eva" })).toBe(
      "The EAPx dashboard shows the wrong case counts",
    );
    expect(
      handoffTicketSummary({ conversation: { subject: "Login loop" } as HandoffConversation, transcript, latestMessage: "x", workerName: "Eva" }),
    ).toBe("Login loop");
    expect(handoffTicketSummary({ conversation, transcript: [], latestMessage: "help me please now", workerName: "Eva" })).toBe(
      "help me please now",
    );
  });

  it("finds the issue key wherever the toolkit version put it", () => {
    expect(issueKeyFrom({ data: { key: "SUP-1" } })).toBe("SUP-1");
    expect(issueKeyFrom({ data: { response_data: { key: "SUP-22" } } })).toBe("SUP-22");
    expect(issueKeyFrom({ data: { key: "not-a-key" } })).toBeNull();
  });
});

describe("the customer's own tickets", () => {
  it("are this conversation's and the same email's, never another customer's", async () => {
    const mine = await newConversation({ customerEmail: "ana@example.com", externalTicketKey: "SUP-1" });
    await newConversation({ customerEmail: "ANA@example.com", externalTicketKey: "SUP-2" });
    await newConversation({ customerEmail: "bob@example.com", externalTicketKey: "SUP-3" });

    const keys = await customerTicketKeys(orgId, mine.id);
    expect(keys.sort()).toEqual(["SUP-1", "SUP-2"]);
  });

  it("reads only those tickets from Jira, by key", async () => {
    const mine = await newConversation({ externalTicketKey: "SUP-1" });
    executeToolMock.mockResolvedValue({
      successful: true,
      error: null,
      data: { key: "SUP-1", fields: { summary: "Invoice wrong", status: { name: "In Progress" }, resolution: null } },
    });

    const result = JSON.parse(await lookupCustomerTickets(orgId, mine.id, "ca_jira"));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock.mock.calls[0][0]).toBe(JIRA_GET_ISSUE_SLUG);
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ issue_id_or_key: "SUP-1" });
    expect(result.tickets).toEqual([
      { key: "SUP-1", summary: "Invoice wrong", status: "In Progress", resolution: null, updated: null },
    ]);
  });
});

describe("Confluence searched before answering", () => {
  it("searches for the words that matter, in the configured space", () => {
    expect(searchKeywords("Hi, how do I reset my password please?")).toEqual(["reset", "password"]);
    expect(buildKnowledgeCql(["reset", "password"], "SK")).toBe(
      'type = page AND (text ~ "reset" OR text ~ "password") AND space = "SK"',
    );
    expect(buildKnowledgeCql(['say"hi'], null)).toBe('type = page AND (text ~ "say\\"hi")');
  });

  it("is skipped when Confluence isn't connected or is switched off", async () => {
    expect(await searchConfluenceKnowledge(orgId, "reset password", 3)).toBeNull();
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", {
        metadata: { settings: { searchBeforeAnswering: false } },
      }),
    });
    expect(await searchConfluenceKnowledge(orgId, "reset password", 3)).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("turns matching pages into reference material", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    executeToolMock.mockResolvedValue({
      successful: true,
      error: null,
      data: {
        results: [
          {
            title: "How to reset your password",
            content: {
              id: "123",
              title: "How to reset your password",
              body: { storage: { value: "<p>Go to <b>Settings</b>.</p><p>Click Reset.</p>" } },
            },
          },
        ],
      },
    });

    const matches = await searchConfluenceKnowledge(orgId, "How do I reset my password?", 3);

    expect(executeToolMock.mock.calls[0][0]).toBe(CONFLUENCE_CQL_SEARCH_SLUG);
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ cql: expect.stringContaining('space = "SK"') });
    expect(matches).toEqual([
      {
        documentId: "confluence:123",
        title: "How to reset your password",
        heading: null,
        content: "Go to Settings.\nClick Reset.",
        rank: 1,
      },
    ]);
  });

  it("ranks the space's pages itself when Confluence refuses the search (no search scope)", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const page = (id: string, title: string, html: string, space = "SK") => ({
      id,
      title,
      body: { storage: { value: html } },
      _links: { webui: `/spaces/${space}/pages/${id}/x` },
    });
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? { successful: false, error: "Unauthorized; scope does not match", data: {} }
        : {
            successful: true,
            error: null,
            data: {
              results: [
                page("1", "How to add a new user", "<p>Open Administration.</p>"),
                page("2", "How to reset your password", "<p>Click Forgot password, then reset it.</p>"),
                page("3", "Reset password (other space)", "<p>Not ours.</p>", "OTHER"),
              ],
            },
          },
    );

    const matches = await searchConfluenceKnowledge(orgId, "How do I reset my password?", 3);

    expect(executeToolMock.mock.calls.map((call) => call[0])).toEqual([CONFLUENCE_CQL_SEARCH_SLUG, CONFLUENCE_GET_PAGES_SLUG]);
    expect(matches?.map((match) => match.title)).toEqual(["How to reset your password"]);
    expect(matches?.[0].content).toContain("Click Forgot password");
  });

  it("weighs title matches above body matches", () => {
    expect(scorePage("Reset your password", "", ["password"])).toBeGreaterThan(scorePage("Users", "password", ["password"]));
    expect(scorePage("Users", "nothing here", ["password"])).toBe(0);
  });

  it("throws a ConfluenceKnowledgeError when the search fails twice", async () => {
    vi.useFakeTimers();
    try {
      connectionsFor({ knowledge_base: connection("knowledge_base", "confluence") });
      executeToolMock.mockRejectedValue(new Error("401"));
      const pending = searchConfluenceKnowledge(orgId, "reset password", 3);
      const assertion = expect(pending).rejects.toBeInstanceOf(ConfluenceKnowledgeError);
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the customer agent's generic actions", () => {
  it("can't reach Jira or Confluence through the action runner", async () => {
    connectionsFor({ helpdesk: jiraReady(), crm: connection("crm", "zoho") });
    getActionSchemaMock.mockResolvedValue({
      slug: "JIRA_ADD_COMMENT",
      name: "Add comment",
      toolkit: "jira",
      version: "20260915_00",
      tags: [],
      isDeprecated: false,
    });

    const run = await executeRunAction(
      { action: "JIRA_ADD_COMMENT", argumentsJson: '{"issue_id_or_key":"SUP-9","comment":"hi"}' },
      { organizationId: orgId, requireWriteApproval: false, excludeToolkits: ["jira", "confluence"] },
    );
    expect(run).toContain("isn't available here");
    expect(executeToolMock).not.toHaveBeenCalled();

    searchActionsMock.mockResolvedValue([]);
    await executeSearchActions("add a comment", undefined, orgId, ["jira", "confluence"]);
    expect(searchActionsMock.mock.calls[0][0]).toEqual(["zoho"]);
  });
});

describe("a handoff in chat", () => {
  const previousAdapter = getIdentityAdapter();
  const previousDemo = process.env.DEMO_MODE;
  const previousKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    const adapter: IdentityAdapter = {
      resolveManagerRequest: async () => ({ orgId, userId: "test-manager", role: "owner", source: "test" }),
      resolveWidgetRequest: async () => null,
    };
    setIdentityAdapter(adapter);
    process.env.DEMO_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
  });

  afterEach(() => {
    setIdentityAdapter(previousAdapter);
    if (previousDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemo;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  function chat(message: string) {
    return postChat(
      new NextRequest("http://localhost/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        duplex: "half" as const,
      }),
    );
  }

  it("raises the ticket and tells the customer its number", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValue({
      answer: "I'm bringing in a teammate who can help.",
      confidence: 0.3,
      escalate: true,
      citations: [],
    });

    const body = (await (await chat("My invoice is wrong")).json()) as {
      conversation_id: string;
      status: string;
      message: { body: string };
    };

    expect(body.status).toBe("needs_human");
    expect(body.message.body).toBe(
      "I'm bringing in a teammate who can help.\n\nI've logged this for the team as SUP-12, so you can quote that number if you follow up.",
    );
    const [stored] = await db.select().from(conversations).where(eq(conversations.id, body.conversation_id));
    expect(stored.externalTicketKey).toBe("SUP-12");
  });

  it("still hands off when Jira fails, without a ticket number", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockRejectedValue(new Error("Jira down"));
    runAgentMock.mockResolvedValue({
      answer: "I'm bringing in a teammate who can help.",
      confidence: 0.3,
      escalate: true,
      citations: [],
    });

    const body = (await (await chat("My invoice is wrong")).json()) as {
      conversation_id: string;
      status: string;
      message: { body: string };
    };

    expect(body.status).toBe("needs_human");
    expect(body.message.body).toBe("I'm bringing in a teammate who can help.");
    const [stored] = await db.select().from(conversations).where(eq(conversations.id, body.conversation_id));
    expect(stored.externalTicketError).toBe("Jira down");
  });

  it("raises nothing when the worker answers", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    runAgentMock.mockResolvedValue({ answer: "Go to Billing.", confidence: 0.8, escalate: false, citations: [] });

    await chat("Where are invoices?");
    expect(executeToolMock).not.toHaveBeenCalled();
  });
});
