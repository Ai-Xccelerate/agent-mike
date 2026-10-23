import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { POST as postChat } from "@/app/api/v1/chat/route";
import { POST as postChatAgui } from "@/app/api/v1/chat/agui/route";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { runCustomerTurn } from "@/lib/customer-turn";
import { messages as messagesTable } from "@/db/schema";
import {
  buildKnowledgeCql,
  clearConfluenceCatalog,
  pickRelevantText,
  wordStem,
  scoreCatalogPage,
  stemWeights,
  expandKeywords,
  confluenceListingProbe,
  confluenceIndexSource,
  focusOnQuestion,
  rankByTitleMatch,
  CONFLUENCE_CQL_SEARCH_SLUG,
  ConfluenceKnowledgeError,
  customerTicketKeys,
  helpdeskCapabilities,
  lookupJiraCustomerByEmail,
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
  clearRequestTypeCatalogCache,
  requestFieldValuesFor,
  requestTypeFieldsFrom,
  requestTypeGuidance,
  type RequestTypeCatalog,
} from "@/lib/tools-integrations/atlassian";
import { chooseRequestType } from "@/lib/request-type-choice";
import { workerTitle } from "@/lib/tools-integrations/atlassian";
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
vi.mock("@/lib/request-type-choice", () => ({ chooseRequestType: vi.fn() }));
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
  clearConfluenceCatalog();
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Atlassian test org");
  getConnectionMock.mockReset();
  getConnectionMock.mockResolvedValue(null);
  clearRequestTypeCatalogCache();
  vi.mocked(chooseRequestType).mockReset();
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
      workerChoosesRequestType: false,
      createCustomers: false,
    });
    expect(readJiraSettings({ settings: { projectKey: "not a key!" } }).projectKey).toBeNull();
    expect(readConfluenceSettings(null)).toEqual({ spaceKeys: [], searchBeforeAnswering: true });
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

    expect(result).toMatchObject({ key: "SUP-7", created: true });
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

    expect(result).toMatchObject({ key: "SUP-7", created: false });
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
    expect(await recordHandoffInJira(input)).toMatchObject({ key: "SUP-9", created: true });
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

      expect(result).toMatchObject({ key: "SUP-12", created: true });
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

      expect(await recordHandoffInJira(input)).toMatchObject({ key: "SUP-12", created: false });
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
      expect(await recordHandoffInJira(input)).toMatchObject({ key: "SUP-12", created: false });
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

  describe("when the worker chooses the request type", () => {
    const API = "https://api.atlassian.com/ex/jira/cloud-acme";
    const chooseMock = vi.mocked(chooseRequestType);
    const workerChooses = (extra: Record<string, unknown> = {}) =>
      connection("helpdesk", "jira", {
        metadata: {
          settings: { projectKey: "SUP", issueType: null, createTicketOnHandoff: true, workerChoosesRequestType: true, ...extra },
        },
      });

    const productField = {
      fieldId: "customfield_10050",
      name: "Product",
      required: true,
      validValues: [
        { value: "10001", label: "EAP Expert V3" },
        { value: "10002", label: "Online Intake" },
      ],
      jiraSchema: { type: "option" },
    };

    /** A desk with an outage type (no extra fields) and a feature type that needs a Product. */
    function deskAnswers(post: { status: number; data: unknown } = { status: 201, data: { issueKey: "SUP-40" } }) {
      proxyRequestMock.mockImplementation(async ({ endpoint, method }) => {
        if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] };
        if (method === "GET" && endpoint.endsWith("/requesttype/20/field")) {
          return { status: 200, data: { requestTypeFields: [{ fieldId: "summary", name: "Summary", required: true, jiraSchema: { type: "string" } }] } };
        }
        if (method === "GET" && endpoint.endsWith("/requesttype/21/field")) {
          return { status: 200, data: { requestTypeFields: [{ fieldId: "description", name: "Description", required: true, jiraSchema: { type: "string" } }, productField] } };
        }
        if (method === "GET" && endpoint.includes("/requesttype")) {
          return {
            status: 200,
            data: {
              values: [
                { id: "20", name: "System Unavailable", description: "System unavailable to one or more users" },
                { id: "21", name: "Request a New Feature", description: "Have something you want added into the system?" },
              ],
            },
          };
        }
        if (method === "GET" && endpoint.includes("/servicedeskapi/servicedesk")) return { status: 200, data: { values: [{ id: "1", projectKey: "SUP" }] } };
        if (method === "GET" && endpoint.includes("/rest/api/3/issue/")) return { status: 200, data: { fields: { priority: { name: "Informational" } } } };
        if (method === "POST") return post;
        return { status: 204, data: null };
      });
    }

    const catalog: RequestTypeCatalog = {
      serviceDeskId: "1",
      projectKey: "SUP",
      requestTypes: [
        { id: "20", name: "System Unavailable", description: "", fields: [] },
        { id: "21", name: "Request a New Feature", description: "", fields: requestTypeFieldsFrom({ requestTypeFields: [productField] }) },
      ],
    };

    async function handoff(row: Awaited<ReturnType<typeof newConversation>>) {
      return recordHandoffInJira({
        organizationId: orgId,
        workerName: "Eva",
        conversation: handoffConversation(row),
        transcript: [{ speaker: "Ana", body: "Nobody in our office can log in to EAP Expert" }],
        latestMessage: "Nobody in our office can log in to EAP Expert",
      });
    }

    it("raises the request as the type the worker chose, with the fields it filled in", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();
      chooseMock.mockResolvedValue({
        title: "Add optional Pronouns field to Online Intake form",
        requestTypeId: "21",
        fields: [{ fieldId: "customfield_10050", values: ["eap expert v3"] }],
      });
      const row = await newConversation();

      expect(await handoff(row)).toMatchObject({ key: "SUP-40", created: true });

      // The worker read the desk's own list, descriptions and needs included.
      const { catalogText, problem } = chooseMock.mock.calls[0][0];
      expect(catalogText).toContain("[20] System Unavailable: System unavailable to one or more users");
      expect(catalogText).toContain("Needs: Product [customfield_10050] (one of: EAP Expert V3, Online Intake)");
      expect(problem).toBeUndefined();
      const create = proxyRequestMock.mock.calls.find(([call]) => call.method === "POST")![0];
      expect(create.endpoint).toBe(`${API}/rest/servicedeskapi/request`);
      expect(create.body).toMatchObject({
        serviceDeskId: "1",
        requestTypeId: "21",
        // The worker's title, not the customer's opening words.
        requestFieldValues: { customfield_10050: { id: "10001" }, summary: "Add optional Pronouns field to Online Intake form" },
      });
      // Kept for the Overview: what it went in as, and the priority Jira gave it.
      const [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
      expect(stored).toMatchObject({ externalTicketKey: "SUP-40", externalTicketType: "Request a New Feature", externalTicketPriority: "Informational" });
    });

    it("sends a choice the desk can't take back once with the reason, keeping its request type", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();
      chooseMock
        .mockResolvedValueOnce({ requestTypeId: "21", fields: [] })
        .mockResolvedValueOnce({ requestTypeId: "21", fields: [{ fieldId: "customfield_10050", values: ["Online Intake"] }] });
      const row = await newConversation();

      expect(await handoff(row)).toMatchObject({ key: "SUP-40", created: true });
      expect(chooseMock).toHaveBeenCalledTimes(2);
      expect(chooseMock.mock.calls[1][0]).toMatchObject({
        problem: "Product is required for Request a New Feature.",
        keepRequestTypeId: "21",
      });
      const create = proxyRequestMock.mock.calls.find(([call]) => call.method === "POST")![0];
      expect(create.body).toMatchObject({ requestTypeId: "21", requestFieldValues: { customfield_10050: { id: "10002" } } });
    });

    it("won't switch to a type that asks for less just to get past a required field", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();
      chooseMock
        .mockResolvedValueOnce({ requestTypeId: "21", fields: [] })
        .mockResolvedValueOnce({ requestTypeId: "20", fields: [] });
      const row = await newConversation();

      const result = await handoff(row);

      expect(result).toEqual({
        failed: "Eva couldn't choose a request type: It switched from request type 21 to 20 to get round a required field.",
      });
      expect(proxyRequestMock.mock.calls.some(([call]) => call.method === "POST")).toBe(false);
    });

    it("only offers request types a customer can ask for in the portal", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();
      const base = proxyRequestMock.getMockImplementation()!;
      proxyRequestMock.mockImplementation(async (call) => {
        if (call.method === "GET" && call.endpoint.endsWith("/requesttype?limit=100")) {
          return {
            status: 200,
            data: {
              values: [
                { id: "20", name: "System Unavailable", description: "System unavailable to one or more users", groupIds: ["1"] },
                { id: "7", name: "Emailed request", description: "Request received from your email support channel.", groupIds: [] },
              ],
            },
          };
        }
        return base(call);
      });

      const guidance = await requestTypeGuidance(orgId);

      expect(guidance).toContain("System Unavailable");
      expect(guidance).not.toContain("Emailed request");
    });

    it("serves the cached request types while an expired copy reloads, instead of making the customer wait", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();
      expect(await requestTypeGuidance(orgId)).toContain("System Unavailable");
      const callsAfterFirstLoad = proxyRequestMock.mock.calls.length;

      // Eleven minutes on, with Jira now too slow to answer: the turn still gets the old list at once.
      const realNow = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(realNow + 11 * 60 * 1000);
      const base = proxyRequestMock.getMockImplementation()!;
      let releaseJira: () => void = () => undefined;
      const jiraIsSlow = new Promise<void>((resolve) => (releaseJira = resolve));
      proxyRequestMock.mockImplementation(async (call) => {
        await jiraIsSlow;
        return base(call);
      });

      const guidance = await requestTypeGuidance(orgId);
      expect(guidance).toContain("System Unavailable");

      // The refresh was started in the background, and a second turn doesn't start another.
      await vi.waitFor(() => expect(proxyRequestMock.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad));
      const callsWhileRefreshing = proxyRequestMock.mock.calls.length;
      await requestTypeGuidance(orgId);
      expect(proxyRequestMock.mock.calls.length).toBe(callsWhileRefreshing);

      releaseJira();
      clock.mockRestore();
    });

    it("raises no ticket rather than a wrong one, even with a default request type saved", async () => {
      connectionsFor({ helpdesk: workerChooses({ requestTypeId: "20", requestTypeName: "System Unavailable" }) });
      deskAnswers();
      chooseMock.mockResolvedValue({ requestTypeId: "99", fields: [] });
      const row = await newConversation();

      const result = await handoff(row);

      expect(result).toEqual({ failed: "Eva couldn't choose a request type: There's no request type 99. Choose one of the ids listed." });
      expect(proxyRequestMock.mock.calls.some(([call]) => call.method === "POST")).toBe(false);
      const [stored] = await db.select().from(conversations).where(eq(conversations.id, row.id));
      expect(stored.externalTicketKey).toBeNull();
      expect(stored.externalTicketError).toContain("couldn't choose a request type");
    });

    it("fails visibly when the desk's request types can't be read", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      proxyRequestMock.mockImplementation(async ({ endpoint }) => {
        if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] };
        return { status: 401, data: { message: "Unauthorized; scope does not match" } };
      });
      const row = await newConversation();

      const result = await handoff(row);

      expect(result).toMatchObject({ failed: expect.stringContaining("Couldn't find the SUP service desk") });
      expect(chooseMock).not.toHaveBeenCalled();
    });

    it("tells the customer agent what each kind of request needs, and never to ask for a category", async () => {
      connectionsFor({ helpdesk: workerChooses() });
      deskAnswers();

      const guidance = await requestTypeGuidance(orgId);

      expect(guidance).toContain("never ask the customer to pick a category");
      expect(guidance).toContain("[21] Request a New Feature: Have something you want added into the system?");
      expect(guidance).toContain("Needs: Product (one of: EAP Expert V3, Online Intake)");

      connectionsFor({ helpdesk: jsmReadyFixed() });
      expect(await requestTypeGuidance(orgId)).toBe("");
    });

    it("still tells the customer agent what each request needs when ticket raising is switched off", async () => {
      connectionsFor({ helpdesk: workerChooses({ createTicketOnHandoff: false }) });
      deskAnswers();

      const guidance = await requestTypeGuidance(orgId);

      expect(guidance).toContain("Needs: Product (one of: EAP Expert V3, Online Intake)");
      expect(guidance).toContain("no ticket is raised yet");
      expect(guidance).not.toContain("a ticket is raised on the team's service desk");
    });

    it("says a ticket is raised when ticket raising is on", async () => {
      connectionsFor({ helpdesk: workerChooses({ createTicketOnHandoff: true }) });
      deskAnswers();
      expect(await requestTypeGuidance(orgId)).toContain("a ticket is raised on the team's service desk");
    });

    it("gives no guidance when the worker doesn't choose request types", async () => {
      connectionsFor({ helpdesk: workerChooses({ workerChoosesRequestType: false, createTicketOnHandoff: false }) });
      deskAnswers();
      expect(await requestTypeGuidance(orgId)).toBe("");
    });

    const jsmReadyFixed = () =>
      connection("helpdesk", "jira", {
        metadata: { settings: { projectKey: "SUP", issueType: null, requestTypeId: "8", createTicketOnHandoff: true } },
      });

    it("keeps the conversation's own topic when the worker's title is missing or too vague", () => {
      expect(workerTitle(undefined)).toBeUndefined();
      expect(workerTitle("Error")).toBeUndefined();
      expect(workerTitle('  "Login fails for whole office since 9am"  ')).toBe("Login fails for whole office since 9am");
      expect(workerTitle("x".repeat(200))).toHaveLength(121);
    });

    it("checks a choice field by field", () => {
      expect(requestFieldValuesFor(catalog, { requestTypeId: "21", fields: [{ fieldId: "customfield_10050", values: ["10002"] }] })).toEqual({
        requestTypeId: "21",
        name: "Request a New Feature",
        values: { customfield_10050: { id: "10002" } },
      });
      expect(requestFieldValuesFor(catalog, { requestTypeId: "21", fields: [{ fieldId: "customfield_10050", values: ["Mobile"] }] })).toEqual({
        problem: "Product must be one of: EAP Expert V3, Online Intake.",
      });
      expect(requestFieldValuesFor(catalog, { requestTypeId: null, fields: [] })).toEqual({
        problem: "No request type was chosen. Choose one of the ids listed.",
      });
      // Fields the request type doesn't have are left out, not sent to Jira.
      expect(requestFieldValuesFor(catalog, { requestTypeId: "20", fields: [{ fieldId: "customfield_1", values: ["x"] }] })).toEqual({
        requestTypeId: "20",
        name: "System Unavailable",
        values: {},
      });
    });

    it("reads field kinds from Jira and leaves out the ones the code fills in", () => {
      const fields = requestTypeFieldsFrom({
        requestTypeFields: [
          { fieldId: "summary", name: "Summary", required: true, jiraSchema: { type: "string" } },
          { fieldId: "customfield_1", name: "Build Date", required: false, jiraSchema: { type: "string" } },
          { fieldId: "priority", name: "Priority", required: true, validValues: [{ value: "1", label: "High" }], jiraSchema: { type: "priority" } },
          { fieldId: "customfield_2", name: "Modules", required: false, validValues: [{ value: "5", label: "Surveys" }], jiraSchema: { type: "array", items: "option" } },
          { fieldId: "customfield_3", name: "Approver", required: false, jiraSchema: { type: "user" } },
        ],
      });
      expect(fields.map((field) => [field.fieldId, field.kind])).toEqual([
        ["customfield_1", "text"],
        ["priority", "option"],
        ["customfield_2", "options"],
        ["customfield_3", "unsupported"],
      ]);
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
  it("are this conversation's and the same verified email's, never another customer's", async () => {
    const mine = await newConversation({ customerEmail: "ana@example.com", customerEmailVerifiedAt: new Date(), externalTicketKey: "SUP-1" });
    await newConversation({ customerEmail: "ANA@example.com", externalTicketKey: "SUP-2" });
    await newConversation({ customerEmail: "bob@example.com", externalTicketKey: "SUP-3" });

    const keys = await customerTicketKeys(orgId, mine.id);
    expect(keys.sort()).toEqual(["SUP-1", "SUP-2"]);
  });

  it("do not follow an email the visitor only typed: that would let anyone read someone else's tickets", async () => {
    const typed = await newConversation({ channel: "widget", customerEmail: "ana@example.com", externalTicketKey: "SUP-1" });
    await newConversation({ customerEmail: "ana@example.com", externalTicketKey: "SUP-2" });

    expect(await customerTicketKeys(orgId, typed.id)).toEqual(["SUP-1"]);
  });

  it("follow the sender address of an email conversation", async () => {
    const mail = await newConversation({ channel: "email", customerEmail: "ana@example.com", externalTicketKey: "SUP-1" });
    await newConversation({ customerEmail: "ana@example.com", externalTicketKey: "SUP-2" });

    expect((await customerTicketKeys(orgId, mail.id)).sort()).toEqual(["SUP-1", "SUP-2"]);
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
    expect(buildKnowledgeCql(["reset", "password"], ["SK"])).toBe(
      'type = page AND (text ~ "reset" OR text ~ "password") AND space in ("SK")',
    );
    expect(buildKnowledgeCql(["reset"], ["EAPX", "EESD", "PGFP"])).toBe(
      'type = page AND (text ~ "reset") AND space in ("EAPX", "EESD", "PGFP")',
    );
    expect(buildKnowledgeCql(['say"hi'], [])).toBe('type = page AND (text ~ "say\\"hi")');
  });

  it("puts the page named for the question ahead of pages that only mention the words", () => {
    const pages = [
      { title: "Self-Scheduler Client Portal" },
      { title: "Expert Additional Forms Feature" },
      { title: "Service Member Registration for the Self-Scheduler" },
    ];
    expect(rankByTitleMatch(pages, searchKeywords("How do members register for the Self-Scheduler?"))[0].title).toBe(
      "Service Member Registration for the Self-Scheduler",
    );
    expect(rankByTitleMatch(pages, ["unrelated"]).map((p) => p.title)).toEqual(pages.map((p) => p.title));
  });

  it("finds the registration article that Confluence returned sixth for the real question", () => {
    // Order as Confluence returned it for "Self-Scheduler registration" on EAP Expert's site (22 Oct).
    const returned = [
      "EAP Expert V3 Release Notes",
      "Provider Portal 2020 Release Notes",
      "Documentation of existing placeholders for all Templates in EAPx",
      "Self-Scheduler Client Portal",
      "Service Member Guide: Using the Self-Scheduler Portal",
      "Service Member Registration for the Self-Scheduler",
      "Self-Scheduler Client Portal Set-Up",
      "Archived EAP Expert V3 Release Notes",
      "Integrations Options",
      "Client Files Options",
    ].map((title) => ({ title }));
    const keywords = searchKeywords("How do members register for the Self-Scheduler?");
    expect(rankByTitleMatch(returned, keywords).slice(0, 5).map((p) => p.title)).toContain(
      "Service Member Registration for the Self-Scheduler",
    );
    expect(rankByTitleMatch(returned, keywords)[0].title).toBe("Service Member Registration for the Self-Scheduler");
  });

  it("reads the old single spaceKey as a one-item list and dedupes a list", () => {
    expect(readConfluenceSettings({ settings: { spaceKey: "SK" } }).spaceKeys).toEqual(["SK"]);
    expect(readConfluenceSettings({ settings: { spaceKeys: ["A", "B", "A"] } }).spaceKeys).toEqual(["A", "B"]);
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
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ cql: expect.stringContaining('space in ("SK")') });
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

  it("reads the best pages in full when the search hit carries only an excerpt", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const steps = "Share the registration link. Members then enter their details and receive an email to set a password.";
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? {
            successful: true,
            error: null,
            data: { results: [{ title: "Service Member Registration for the Self-Scheduler", excerpt: "Registration", content: { id: "555", title: "Service Member Registration for the Self-Scheduler" } }] },
          }
        : { successful: true, error: null, data: { id: "555", title: "x", body: { storage: { value: `<p>${steps}</p>` } } } },
    );

    const matches = await searchConfluenceKnowledge(orgId, "How do members register for the Self-Scheduler?", 3);

    expect(matches?.[0].content).toContain("receive an email to set a password");
  });

  it("finds a page that Confluence's own search ranked too low, through the page catalog", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const page = (id: string, title: string, html: string) => ({
      id,
      title,
      body: { storage: { value: html } },
      _links: { webui: `/spaces/SK/pages/${id}/x` },
    });
    const noisy = ["EAP Expert V3 Release Notes", "Provider Portal 2020 Release Notes", "Documentation of placeholders"].map((title, i) =>
      page(String(i + 1), title, "<p>Members can register for the self-scheduler. Members, members, members register.</p>"),
    );
    const wanted = page("9", "Service Member Registration for the Self-Scheduler", "<p>Share the link. They then get an email to set a password.</p>");
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? {
            successful: true,
            error: null,
            // Confluence's order: the wanted page is not in it at all.
            data: { results: noisy.map((n) => ({ title: n.title, content: { id: n.id, title: n.title, body: n.body } })) },
          }
        : { successful: true, error: null, data: { results: [...noisy, wanted] } },
    );

    const matches = await searchConfluenceKnowledge(orgId, "How do members register for the Self-Scheduler?", 5);

    expect(matches?.[0].title).toBe("Service Member Registration for the Self-Scheduler");
    expect(matches?.[0].content).toContain("email to set a password");
  });

  it("lists every page it can search, once, and remembers it", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    executeToolMock.mockResolvedValue({
      successful: true,
      error: null,
      data: { results: [{ id: "1", title: "A page", body: { storage: { value: "<p>text</p>" } }, _links: { webui: "/spaces/SK/pages/1/x" } }] },
    });
    const { confluenceInventory } = await import("@/lib/tools-integrations/atlassian");
    expect((await confluenceInventory(orgId))?.pages.map((p) => p.title)).toEqual(["A page"]);
    await confluenceInventory(orgId);
    expect(executeToolMock).toHaveBeenCalledTimes(1);
  });

  it("scores a page named for the question above pages that only mention its words", () => {
    const keywords = searchKeywords("How do members register for the Self-Scheduler?");
    const named = { title: "Service Member Registration for the Self-Scheduler", text: "Share the link." };
    const noisy = { title: "EAP Expert V3 Release Notes", text: "members register self-scheduler ".repeat(10) };
    expect(scoreCatalogPage(named, keywords)).toBeGreaterThan(scoreCatalogPage(noisy, keywords));
  });

  it("lets a rare word beat words that are in nearly every title (Parallels vs EAP Expert)", () => {
    const pages = [
      { title: "Parallels Support Guide", text: "Parallels is how hosted customers reach EAP Expert. Open the Parallels client and sign in." },
      ...Array.from({ length: 30 }, (_, i) => ({ title: `EAP Expert V3 Guide ${i}`, text: "EAP Expert eap expert eap expert eap expert." })),
    ];
    const keywords = searchKeywords("How do I use Parallels to get to EAP Expert?");
    expect(keywords).not.toContain("use");
    const weights = stemWeights(pages, keywords);
    expect(weights[wordStem("parallels")]).toBeGreaterThan(weights[wordStem("expert")] * 2);
    const ranked = [...pages].sort((a, b) => scoreCatalogPage(b, keywords, weights) - scoreCatalogPage(a, keywords, weights));
    expect(ranked[0].title).toBe("Parallels Support Guide");
  });

  it("finds the question in a long message instead of searching on its opening", () => {
    const preamble =
      "Hi team, hope you are well. I wanted to give you some background because our director asked me to write this up properly. Last quarter we migrated three offices to a new network and since then a few of the case managers have mentioned that things feel slower than before, although honestly it varies by day. Our IT contractor, who only works Tuesdays, thinks it might be the VPN. Meanwhile we hired two new intake staff who need accounts. ";
    const message = `${preamble}Anyway, the actual thing I wanted to ask, and sorry for the long preamble, is how I can run a utilization report for just one employer for just the last quarter. I tried it yesterday and got a report for everybody. Thanks so much, and have a lovely weekend. Regards, Sam.`;
    const focus = focusOnQuestion(message);
    expect(focus).toContain("utilization report");
    expect(focus.length).toBeLessThan(message.length / 2);
    // The "I wanted to ask, and sorry for the long preamble, is" lead-in is dropped, so its words are not searched.
    expect(focus.startsWith("how I can run a utilization report")).toBe(true);
    expect(focus).not.toContain("preamble");
    const words = searchKeywords(focus, 12);
    expect(words).toEqual(expect.arrayContaining(["utilization", "report", "employer"]));
    expect(words).not.toContain("hope");
    // The old way took the first six words of the message, none of them the question.
    expect(searchKeywords(message)).not.toContain("utilization");
    // Short messages are searched whole.
    expect(focusOnQuestion("How do I reset my password?")).toBe("How do I reset my password?");
  });

  it("finds the page for a question buried in a long message", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const page = (id: string, title: string, html: string) => ({ id, title, body: { storage: { value: html } }, _links: { webui: `/spaces/SK/pages/${id}/x` } });
    const filler = Array.from({ length: 12 }, (_, i) => page(String(i + 1), `Network and VPN setup ${i}`, "<p>Case managers, offices, network, accounts, staff.</p>"));
    const wanted = page("99", "Generating a Utilization Report", "<p>Choose the employer and the quarter, then Preview.</p>");
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? { successful: true, error: null, data: { results: [] } }
        : { successful: true, error: null, data: { results: [...filler, wanted] } },
    );
    const message =
      "Hi team, hope you are well. Last quarter we migrated three offices to a new network and since then case managers say things feel slower, and our staff accounts need review. ".repeat(3) +
      "Anyway, the actual thing I wanted to ask is how I can run a utilization report for just one employer. Thanks so much, Sam.";
    const matches = await searchConfluenceKnowledge(orgId, message, 3);
    expect(matches?.[0].title).toBe("Generating a Utilization Report");
  });

  it("does not let long release notes full of everyday words outrank the page named for the question", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const page = (id: string, title: string, html: string) => ({ id, title, body: { storage: { value: html } }, _links: { webui: `/spaces/SK/pages/${id}/x` } });
    const everyday = "<p>We ask that you review the long list. Last quarter the report was updated. Ask your employer about each utilization item. </p>".repeat(30);
    const pages = [
      page("1", "EAP Expert V3 Release Notes", everyday),
      page("2", "Archived EAP Expert V3 Release Notes", everyday),
      page("3", "Part 1: Customizing a Utilization Report", "<p>Choose columns and the employer.</p>"),
      page("4", "Generating a Utilization Report", "<p>Set the Report Type, pick the Organization, enter the Start Date and End Date, then Preview.</p>"),
      // Everyday words show up across a real knowledge base, so they say little about any one page.
      ...Array.from({ length: 30 }, (_, i) => page(String(10 + i), `Other topic ${i}`, "<p>We ask that you read the long note. Last quarter this changed, ask your team.</p>")),
    ];
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? { successful: true, error: null, data: { results: [] } }
        : { successful: true, error: null, data: { results: pages } },
    );
    const message =
      "Hi team, hope you are well. We migrated offices to a new network and staff feel things are slower. ".repeat(4) +
      "Anyway, the actual thing I wanted to ask, and sorry for the long preamble, is how I can run a utilization report for just one employer for just the last quarter. Thanks so much, Sam.";
    const matches = await searchConfluenceKnowledge(orgId, message, 3);
    const titles = matches?.map((m) => m.title) ?? [];
    expect(titles.indexOf("Generating a Utilization Report")).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf("Generating a Utilization Report")).toBeLessThan(titles.indexOf("EAP Expert V3 Release Notes") === -1 ? 99 : titles.indexOf("EAP Expert V3 Release Notes"));
  });

  it("gives the top three pages in full, so steps near the end of a 6,000-character page are not cut", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    const page = (id: string, title: string, html: string) => ({ id, title, body: { storage: { value: html } }, _links: { webui: `/spaces/SK/pages/${id}/x` } });
    const steps = "<p>Set Report Type to Single Organization, then choose the Organization.</p>";
    const pages = [
      // Their titles also carry "run", so the long page below ranks third.
      page("1", "Run a Utilization Report", "<p>utilization report run.</p>"),
      page("2", "Run Utilization Report for Groups", "<p>utilization report run.</p>"),
      // Third by relevance, 6,000+ characters, with the steps at the very end.
      page("3", "Generating a Utilization Report", `<p>${"Background on the utilization report. ".repeat(160)}</p>${steps}`),
    ];
    executeToolMock.mockImplementation(async (slug) =>
      slug === CONFLUENCE_CQL_SEARCH_SLUG
        ? { successful: true, error: null, data: { results: [] } }
        : { successful: true, error: null, data: { results: pages } },
    );
    const matches = await searchConfluenceKnowledge(orgId, "How do I run a utilization report?", 5);
    expect(matches?.map((m) => m.title).indexOf("Generating a Utilization Report")).toBe(2);
    const generating = matches?.find((m) => m.title === "Generating a Utilization Report");
    expect(generating?.content.length).toBeGreaterThan(5500);
    expect(generating?.content).toContain("Single Organization");
  });

  it("reports what the page listing returns (version numbers, fields, sizes) without page text", async () => {
    connectionsFor({
      knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
    });
    executeToolMock.mockImplementation(async (_slug, args) => ({
      successful: true,
      error: null,
      data: {
        results: [
          {
            id: "1",
            title: "A page",
            version: { number: 7, createdAt: "2026-10-01T00:00:00Z" },
            ...((args as { body_format?: string }).body_format ? { body: { storage: { value: "<p>secret text</p>" } } } : {}),
          },
        ],
        _links: { next: "/wiki/api/v2/pages?cursor=abc" },
      },
    }));
    const probe = await confluenceListingProbe(orgId);
    expect(probe?.withBody).toMatchObject({ hasVersionNumber: true, hasBody: true, hasNextCursor: true, versionSample: { number: 7 } });
    expect(probe?.withoutBody).toMatchObject({ hasVersionNumber: true, hasBody: false });
    // Field names and sizes only: the page text is never in the report.
    expect(JSON.stringify(probe)).not.toContain("secret text");
  });

  describe("the knowledge index source", () => {
    const listed = (id: string, title: string, version: number | undefined, space = "SK") => ({
      id,
      title,
      ...(version === undefined ? {} : { version: { number: version } }),
      _links: { webui: `/spaces/${space}/pages/${id}/x` },
    });

    it("lists pages without text, with versions, only in the configured spaces, following the paging cursor", async () => {
      connectionsFor({
        knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
      });
      executeToolMock.mockImplementation(async (_slug, args) => {
        const cursor = (args as { cursor?: string }).cursor;
        return cursor
          ? { successful: true, error: null, data: { results: [listed("3", "Third", 2), listed("9", "Other space", 1, "OTHER")] } }
          : { successful: true, error: null, data: { results: [listed("1", "First", 5), listed("2", "No version", undefined)], _links: { next: "/wiki/api/v2/pages?cursor=abc123" } } };
      });
      const source = await confluenceIndexSource(orgId);
      const pages = await source!.listMetadata();
      expect(pages).toEqual([
        { id: "1", title: "First", version: 5, link: "/spaces/SK/pages/1/x" },
        { id: "2", title: "No version", version: null, link: "/spaces/SK/pages/2/x" },
        { id: "3", title: "Third", version: 2, link: "/spaces/SK/pages/3/x" },
      ]);
      // Asked without bodies, so the listing stays small.
      expect(executeToolMock.mock.calls.every((call) => !("body_format" in (call[1] as object)))).toBe(true);
      expect((executeToolMock.mock.calls[1][1] as { cursor?: string }).cursor).toBe("abc123");
    });

    it("is not available when Confluence is not connected, and says so when the first listing fails", async () => {
      expect(await confluenceIndexSource(orgId)).toBeNull();
      connectionsFor({
        knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
      });
      executeToolMock.mockResolvedValue({ successful: false, error: "Unauthorized", data: {} });
      const source = await confluenceIndexSource(orgId);
      await expect(source!.listMetadata()).rejects.toThrow("listing failed");
    });

    it("reads a few changed pages one by one, and many in one full listing", async () => {
      connectionsFor({
        knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
      });
      executeToolMock.mockImplementation(async (slug, args) => {
        if (slug === CONFLUENCE_GET_PAGES_SLUG) {
          const results = Array.from({ length: 30 }, (_, i) => ({
            ...listed(String(i + 1), `Page ${i + 1}`, 1),
            body: { storage: { value: `<p>text ${i + 1}</p>` } },
          }));
          return { successful: true, error: null, data: { results } };
        }
        const id = (args as { id: string }).id;
        return { successful: true, error: null, data: { id, title: `Page ${id}`, body: { storage: { value: `<p>one by one ${id}</p>` } }, _links: { webui: `/spaces/SK/pages/${id}/x` } } };
      });
      const source = await confluenceIndexSource(orgId);
      const few = await source!.fetchPages(["4", "7"]);
      expect(few.map((p) => p.text).sort()).toEqual(["one by one 4", "one by one 7"]);
      expect(executeToolMock.mock.calls.map((call) => call[0])).not.toContain(CONFLUENCE_GET_PAGES_SLUG);
      executeToolMock.mockClear();
      const many = await source!.fetchPages(Array.from({ length: 28 }, (_, i) => String(i + 1)));
      expect(many).toHaveLength(28);
      expect(executeToolMock.mock.calls.map((call) => call[0])).toEqual([CONFLUENCE_GET_PAGES_SLUG]);
      expect(await source!.fetchPages([])).toEqual([]);
    });

    it("fails the sync when one changed page cannot be read, instead of indexing half of it", async () => {
      connectionsFor({
        knowledge_base: connection("knowledge_base", "confluence", { metadata: { settings: { spaceKey: "SK" } } }),
      });
      executeToolMock.mockResolvedValue({ successful: false, error: "Not found", data: {} });
      const source = await confluenceIndexSource(orgId);
      await expect(source!.fetchPages(["5"])).rejects.toThrow("could not be read");
    });
  });

  it("adds the page's words for how customers ask about change history and sign-up", () => {
    expect(expandKeywords("Where can I see who changed a record?", ["changed", "record"])).toEqual(expect.arrayContaining(["activity", "audit", "trail"]));
    expect(expandKeywords("How do members sign up?", ["members", "sign"])).toEqual(expect.arrayContaining(["register", "registration"]));
    expect(expandKeywords("How do I add a user?", ["add", "user"])).toEqual(["add", "user"]);
  });

  it("keeps the section with the steps when a long page has to be cut", () => {
    const filler = (n: string) => `## Part ${n}\n${"unrelated filler words ".repeat(60)}`;
    const text = ["Intro line.", filler("one"), filler("two"), "## Setting up modalities\nTick each modality, then save.", filler("three")].join("\n\n");
    const picked = pickRelevantText(text, ["modalities"], 1500);
    expect(picked.length).toBeLessThanOrEqual(1501);
    expect(picked).toContain("Tick each modality, then save.");
    expect(picked).toContain("Intro line.");
    expect(pickRelevantText("short page", ["x"], 1500)).toBe("short page");
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

  it("shows the ticket as a card, and the worker's quick replies as buttons", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValueOnce({
      answer: "Did this work before, or is it something new?",
      confidence: 0.8,
      escalate: false,
      citations: [],
      choices: ["Worked before", "Something new"],
    });
    const first = (await (await chat("The report shows the wrong numbers")).json()) as {
      conversation_id: string;
      message: { cards: { kind: string; data: unknown }[] };
    };
    expect(first.message.cards).toEqual([expect.objectContaining({ kind: "choices", data: { options: ["Worked before", "Something new"] } })]);

    runAgentMock.mockResolvedValueOnce({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const second = (await (
      await postChat(
        new NextRequest("http://localhost/api/v1/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Worked before", conversation_id: first.conversation_id }),
          duplex: "half" as const,
        }),
      )
    ).json()) as { message: { cards: { kind: string; data: Record<string, unknown> }[] } };
    expect(second.message.cards).toEqual([
      expect.objectContaining({
        kind: "helpdesk_ticket",
        data: { key: "SUP-12", title: "The report shows the wrong numbers", requestType: null, created: true },
      }),
    ]);
  });

  it("streams the reply first, then the ticket's number as a second message, over AG-UI", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });

    const res = await postChatAgui(
      new NextRequest("http://localhost/api/v1/chat/agui", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: "t", runId: "r", messages: [{ id: "u", role: "user", content: "My invoice is wrong" }], forwardedProps: {} }),
        duplex: "half" as const,
      }),
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const all = (await res.text())
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")) as { type: string; [key: string]: unknown });
    // Progress lines are sent while the turn runs; they are checked apart from the reply's own events.
    const isStatus = (event: { type: string; name?: unknown }) => event.type === "CUSTOM" && event.name === "chat.status";
    const statuses = all.filter(isStatus).map((event) => (event.value as { stage: string; label: string }).stage);
    expect(statuses).toEqual(["retrieval", "reply", "ticket"]);
    const events = all.filter((event) => !isStatus(event));
    expect(events.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "CUSTOM",
      "CUSTOM",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "RUN_FINISHED",
    ]);
    // The reply does not wait for Jira: it is the worker's words alone.
    expect(events[2]).toMatchObject({ delta: "I'm bringing in a teammate." });
    expect(events[4]).toMatchObject({ name: "chat.turn", value: { escalated: true } });
    // The number arrives after it, as a whole message the panel can add to its list, then the card.
    expect(events[5]).toMatchObject({ name: "chat.ticket", value: { senderType: "agent" } });
    expect(String((events[5].value as { body: string }).body)).toContain("SUP-12");
    expect(String(events[7].delta)).toContain("SUP-12");
    expect(events[9]).toMatchObject({ toolCallName: "show_helpdesk_ticket" });
    expect(JSON.parse(String(events[10].delta))).toMatchObject({ key: "SUP-12", created: true });
  });

  it("answers before the ticket exists, then stores its number as a second message", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    let finishJira: (value: unknown) => void = () => undefined;
    executeToolMock.mockImplementation(() => new Promise((resolve) => (finishJira = resolve as (value: unknown) => void)));
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, senderType: "customer", senderName: "Ana", body: "My invoice is wrong" })
      .returning();

    const turn = await runCustomerTurn({
      organizationId: orgId,
      profile: await getOrCreateProfile(orgId),
      conversation,
      priorMessages: [],
      userMessage,
      speakerName: "Ana",
      deferTicket: true,
    });

    // The turn is done while Jira has not answered: the reply has no ticket in it yet.
    expect(turn.result.escalate).toBe(true);
    expect(turn.reply.body).toBe("I'm bringing in a teammate.");
    expect(turn.reply.cards).toEqual([]);
    expect(turn.pendingTicket).toBeDefined();

    await vi.waitFor(() => expect(executeToolMock).toHaveBeenCalled());
    finishJira({ successful: true, error: null, data: { key: "SUP-12" } });
    const followUp = await turn.pendingTicket;
    expect(followUp?.message.body).toContain("SUP-12");
    expect(followUp?.message.cards).toEqual([expect.objectContaining({ kind: "helpdesk_ticket", data: expect.objectContaining({ key: "SUP-12" }) })]);
    const stored = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, conversation.id));
    expect(stored.map((row) => row.senderType)).toEqual(["customer", "agent", "agent"]);
  });

  it("raises one ticket when the customer writes again before the first one exists", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    jiraAnswers({ status: 201, data: { id: "1" } });
    let finishJira: (value: unknown) => void = () => undefined;
    executeToolMock.mockImplementation(() => new Promise((resolve) => (finishJira = resolve as (value: unknown) => void)));
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "widget" });
    const profile = await getOrCreateProfile(orgId);
    const say = async (body: string) => {
      const [userMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: conversation.id, senderType: "customer", senderName: "Ana", body })
        .returning();
      // As the route does: the conversation as it is when the message arrives.
      const [current] = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
      return runCustomerTurn({
        organizationId: orgId,
        profile,
        conversation: current,
        priorMessages: [],
        userMessage,
        speakerName: "Ana",
        deferTicket: true,
      });
    };

    const first = await say("My invoice is wrong");
    await vi.waitFor(() => expect(executeToolMock).toHaveBeenCalledTimes(1));
    const second = await say("Any news?"); // while Jira is still creating the first ticket
    finishJira({ successful: true, error: null, data: { key: "SUP-12" } });
    await first.pendingTicket;
    await second.pendingTicket;

    // One ticket was created; the second turn added to it instead of raising another.
    expect(executeToolMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the ticket in the reply on the JSON route and by email (no second message to carry it)", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValue({ answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "email", customerEmail: "ana@example.com" });
    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, senderType: "customer", senderName: "Ana", body: "It's broken" })
      .returning();

    const turn = await runCustomerTurn({
      organizationId: orgId,
      profile: await getOrCreateProfile(orgId),
      conversation,
      priorMessages: [],
      userMessage,
      speakerName: "Ana",
      deferTicket: true,
    });

    expect(turn.pendingTicket).toBeUndefined();
    expect(turn.reply.body).toContain("SUP-12");
  });

  it("gives an email reply no cards: its text says everything", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValue({ answer: "Is it everyone, or just you?", confidence: 0.8, escalate: false, citations: [], choices: ["Everyone", "Just me"] });
    const conversation = await insertConversationWithTicket({ organizationId: orgId, channel: "email", customerEmail: "ana@example.com" });
    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, senderType: "customer", senderName: "Ana", body: "It's broken" })
      .returning();

    const turn = await runCustomerTurn({
      organizationId: orgId,
      profile: await getOrCreateProfile(orgId),
      conversation,
      priorMessages: [],
      userMessage,
      speakerName: "Ana",
    });

    expect(turn.reply.cards).toEqual([]);
  });

  it("takes em dashes out of the reply, and out of the ticket that quotes it", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { key: "SUP-12" } });
    runAgentMock.mockResolvedValue({
      answer: "I'm sorry—that sounds frustrating. I'm bringing in a teammate — they'll follow up.",
      confidence: 0.3,
      escalate: true,
      citations: [],
    });

    const body = (await (await chat("My invoice is wrong")).json()) as { message: { body: string } };

    expect(body.message.body).toBe(
      "I'm sorry, that sounds frustrating. I'm bringing in a teammate, they'll follow up.\n\nI've logged this for the team as SUP-12, so you can quote that number if you follow up.",
    );
    const description = String((executeToolMock.mock.calls[0][1] as { description: string }).description);
    expect(description).not.toContain("—");
  });

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
    expect(body.message.body).toContain("I'm bringing in a teammate who can help.");
    // No helpdesk ticket, so the customer is still given the request's own reference.
    expect(body.message.body).toMatch(/logged this for the team as [A-Z]+-\d+/);
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

describe("Jira customers for a verified visitor", () => {
  const API = "https://api.atlassian.com/ex/jira/cloud-acme";
  const desk = () =>
    connection("helpdesk", "jira", {
      metadata: { settings: { projectKey: "SUP", requestTypeId: "8", requestTypeName: "Report a problem", createTicketOnHandoff: true, ...extraSettings } },
    });
  let extraSettings: Record<string, unknown> = {};
  let existingCustomers: unknown[] = [];
  let createCustomer: { status: number; data: unknown } = { status: 201, data: { accountId: "acc-new" } };
  let requestAnswers: { status: number; data: unknown }[] = [];

  const calls = () => proxyRequestMock.mock.calls.map(([call]) => call);
  const requestBodies = () => calls().filter((call) => call.endpoint === `${API}/rest/servicedeskapi/request`).map((call) => call.body as Record<string, unknown>);

  beforeEach(() => {
    extraSettings = { createCustomers: true };
    existingCustomers = [];
    createCustomer = { status: 201, data: { accountId: "acc-new" } };
    requestAnswers = [{ status: 201, data: { issueKey: "SUP-50" } }];
    proxyRequestMock.mockImplementation(async ({ endpoint, method }) => {
      if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] };
      if (method === "GET" && endpoint.includes("/servicedesk/1/customer")) return { status: 200, data: { values: existingCustomers } };
      if (method === "GET" && endpoint.includes("/user/search")) return { status: 200, data: [] };
      if (method === "GET" && endpoint.includes("/servicedeskapi/servicedesk")) return { status: 200, data: { values: [{ id: "1", projectKey: "SUP" }] } };
      if (method === "POST" && endpoint === `${API}/rest/servicedeskapi/customer`) return createCustomer;
      if (method === "POST" && endpoint.endsWith("/servicedesk/1/customer")) return { status: 204, data: null };
      if (method === "POST" && endpoint === `${API}/rest/servicedeskapi/request`) return requestAnswers.shift() ?? { status: 201, data: { issueKey: "SUP-50" } };
      if (method === "GET" && endpoint.includes("/issue/")) return { status: 200, data: { fields: { priority: { name: "Medium" } } } };
      return { status: 204, data: null };
    });
  });

  async function handoff(verifiedCustomer?: { email: string; name: string | null }) {
    connectionsFor({ helpdesk: desk() });
    const row = await newConversation({ channel: "widget", customerName: "Dana Reyes", customerEmail: "dana@example.com" });
    return recordHandoffInJira({
      organizationId: orgId,
      workerName: "Eva",
      conversation: handoffConversation(row),
      transcript: [{ speaker: "Dana Reyes", body: "The report shows the wrong numbers" }],
      latestMessage: "The report shows the wrong numbers",
      ...(verifiedCustomer ? { verifiedCustomer } : {}),
    });
  }
  const dana = { email: "dana@example.com", name: "Dana Reyes" };

  it("creates the customer, adds them to the desk, and raises the request on their behalf", async () => {
    expect(await handoff(dana)).toMatchObject({ key: "SUP-50", created: true });

    expect(calls().find((call) => call.endpoint === `${API}/rest/servicedeskapi/customer`)?.body).toEqual({ email: "dana@example.com", displayName: "Dana Reyes" });
    expect(calls().find((call) => call.endpoint.endsWith("/servicedesk/1/customer") && call.method === "POST")?.body).toEqual({ accountIds: ["acc-new"] });
    expect(requestBodies()[0]).toMatchObject({ raiseOnBehalfOf: "acc-new", serviceDeskId: "1", requestTypeId: "8" });
  });

  it("uses the account the customer already has, and creates nothing", async () => {
    existingCustomers = [{ accountId: "acc-old", emailAddress: "Dana@Example.com" }, { accountId: "acc-other", emailAddress: "other@example.com" }];
    await handoff(dana);

    expect(calls().some((call) => call.endpoint === `${API}/rest/servicedeskapi/customer`)).toBe(false);
    expect(requestBodies()[0]).toMatchObject({ raiseOnBehalfOf: "acc-old" });
  });

  it("does nothing about customers for an email no code came back for", async () => {
    await handoff(undefined);

    expect(calls().some((call) => call.endpoint.includes("/customer"))).toBe(false);
    expect(requestBodies()[0]).not.toHaveProperty("raiseOnBehalfOf");
  });

  it("does nothing about customers while the setting is off, even for a verified email", async () => {
    extraSettings = {};
    await handoff(dana);

    expect(calls().some((call) => call.endpoint.includes("/customer"))).toBe(false);
    expect(requestBodies()[0]).not.toHaveProperty("raiseOnBehalfOf");
  });

  it("still raises the ticket, as itself, when the customer can't be created", async () => {
    createCustomer = { status: 403, data: { errorMessage: "You can't manage customers" } };

    expect(await handoff(dana)).toMatchObject({ key: "SUP-50" });
    expect(requestBodies()).toHaveLength(1);
    expect(requestBodies()[0]).not.toHaveProperty("raiseOnBehalfOf");
    expect(vi.mocked(logToolCall)).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: "jira_customer", status: "error", errorMessage: "You can't manage customers" }),
    );
  });

  it("raises it as itself, once, when Jira refuses to raise on behalf; nothing was created by that refusal", async () => {
    requestAnswers = [{ status: 403, data: { errorMessage: "No permission to raise on behalf" } }, { status: 201, data: { issueKey: "SUP-51" } }];

    expect(await handoff(dana)).toMatchObject({ key: "SUP-51" });
    const bodies = requestBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty("raiseOnBehalfOf");
    expect(bodies[1]).not.toHaveProperty("raiseOnBehalfOf");
  });

  it("does not repeat a request that failed without an answer from Jira, since it may have been created", async () => {
    proxyRequestMock.mockImplementation(async ({ endpoint, method }) => {
      if (endpoint.endsWith("/accessible-resources")) return { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] };
      if (method === "GET" && endpoint.includes("/servicedesk/1/customer")) return { status: 200, data: { values: [{ accountId: "acc-old", emailAddress: "dana@example.com" }] } };
      if (method === "GET" && endpoint.includes("/servicedeskapi/servicedesk")) return { status: 200, data: { values: [{ id: "1", projectKey: "SUP" }] } };
      if (method === "POST" && endpoint === `${API}/rest/servicedeskapi/request`) throw new Error("socket hang up");
      return { status: 204, data: null };
    });

    expect(await handoff(dana)).toEqual({ failed: "socket hang up" });
    expect(requestBodies()).toHaveLength(1);
  });

  it("says whether an email is already a customer, for the card's note", async () => {
    connectionsFor({ helpdesk: desk() });
    existingCustomers = [{ accountId: "acc-old", emailAddress: "dana@example.com" }];
    expect(await lookupJiraCustomerByEmail(orgId, "dana@example.com")).toBe(true);
    // Only an exact match on the email counts, whatever else the search returned.
    expect(await lookupJiraCustomerByEmail(orgId, "nobody@example.com")).toBe(false);
    existingCustomers = [];
    expect(await lookupJiraCustomerByEmail(orgId, "nobody@example.com")).toBe(false);
  });

  it("says nothing when there is no helpdesk", async () => {
    connectionsFor({});
    expect(await lookupJiraCustomerByEmail(orgId, "dana@example.com")).toBeNull();
  });
});

describe("what the helpdesk lets the worker do for a customer", () => {
  it("is nothing without a helpdesk", async () => {
    connectionsFor({});
    expect(await helpdeskCapabilities(orgId)).toEqual({ raisesTickets: false, looksUpTickets: false });
  });

  it("is raising and reading tickets for a connected Jira set up for handoffs", async () => {
    connectionsFor({ helpdesk: jiraReady() });
    expect(await helpdeskCapabilities(orgId)).toEqual({ raisesTickets: true, looksUpTickets: true });
  });

  it("is reading only when Jira is connected but handoffs don't raise tickets", async () => {
    connectionsFor({
      helpdesk: connection("helpdesk", "jira", { metadata: { settings: { projectKey: "SUP", issueType: "Task", createTicketOnHandoff: false } } }),
    });
    expect(await helpdeskCapabilities(orgId)).toEqual({ raisesTickets: false, looksUpTickets: true });
  });

  it("is nothing for a connection that is no longer active, or that can't be read", async () => {
    connectionsFor({ helpdesk: jiraReady({ status: "revoked" }) });
    expect(await helpdeskCapabilities(orgId)).toEqual({ raisesTickets: false, looksUpTickets: false });
    getConnectionMock.mockRejectedValue(new Error("db down"));
    expect(await helpdeskCapabilities(orgId)).toEqual({ raisesTickets: false, looksUpTickets: false });
  });
});
