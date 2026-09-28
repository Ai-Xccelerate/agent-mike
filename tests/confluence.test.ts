import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tools-integrations/connection-repository", () => ({ getConnectionForOrg: vi.fn() }));
vi.mock("@/lib/tools-integrations/composio-client", () => ({ executeTool: vi.fn() }));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));

import {
  buildAgentTools,
  CONFLUENCE_FAILURE_MESSAGE,
  CONFLUENCE_GET_PAGE_SLUG,
  CONFLUENCE_PAGE_TEXT_LIMIT,
  CONFLUENCE_READ_TOOL_NAME,
  CONFLUENCE_SEARCH_SLUG,
  CONFLUENCE_SEARCH_TOOL_NAME,
  CONFLUENCE_TOOLKIT_VERSION,
  confluenceStorageToText,
} from "@/lib/agent";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { getAuthConfigId } from "@/lib/tools-integrations/auth-configs";
import { getIntegration, getIntegrationType } from "@/lib/tools-integrations/registry";

const getConnectionMock = vi.mocked(getConnectionForOrg);
const executeToolMock = vi.mocked(executeTool);

const profile = { toolsConfig: {}, enabledSkills: [], integrationsConfig: {}, requireWriteApproval: true };

function confluence(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: "77777777-7777-7777-7777-777777777777",
    organizationId: "org-1",
    integrationType: "knowledge_base",
    system: "confluence",
    composioAuthConfigId: "ac_confluence_test",
    composioConnectedAccountId: "ca_confluence_test",
    status: "active",
    connectedBy: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsed: null,
    ...overrides,
  };
}

function toolNamed(tools: unknown[], name: string) {
  const found = tools.find((t) => (t as { name?: string }).name === name) as
    | { invoke: (context: unknown, input: string) => Promise<string> }
    | undefined;
  return found;
}

beforeEach(() => {
  getConnectionMock.mockReset();
  getConnectionMock.mockResolvedValue(null);
  executeToolMock.mockReset();
});

describe("Confluence integration", () => {
  it("is a knowledge-base integration with its own Composio auth config", () => {
    expect(getIntegrationType("knowledge_base")).toEqual({ type: "knowledge_base", name: "Knowledge base" });
    expect(getIntegration("knowledge_base_confluence")).toEqual({
      id: "knowledge_base_confluence",
      integrationType: "knowledge_base",
      system: "confluence",
      requiresAuth: true,
    });
    process.env.COMPOSIO_CONFLUENCE_AUTH_CONFIG_ID = "ac_wTLWZN2gZvM6";
    expect(getAuthConfigId("confluence")).toBe("ac_wTLWZN2gZvM6");
    delete process.env.COMPOSIO_CONFLUENCE_AUTH_CONFIG_ID;
  });

  it("gives the agent search and read tools only for an active Confluence connection", async () => {
    getConnectionMock.mockImplementation(async (_org, type) => (type === "knowledge_base" ? confluence() : null));
    const tools = await buildAgentTools(profile, "org-1");
    expect(toolNamed(tools, CONFLUENCE_SEARCH_TOOL_NAME)).toBeTruthy();
    expect(toolNamed(tools, CONFLUENCE_READ_TOOL_NAME)).toBeTruthy();

    getConnectionMock.mockImplementation(async (_org, type) =>
      type === "knowledge_base" ? confluence({ status: "pending" }) : null,
    );
    expect(toolNamed(await buildAgentTools(profile, "org-1"), CONFLUENCE_SEARCH_TOOL_NAME)).toBeUndefined();
  });

  it("searches by title through Composio with the pinned toolkit version", async () => {
    getConnectionMock.mockImplementation(async (_org, type) => (type === "knowledge_base" ? confluence() : null));
    executeToolMock.mockResolvedValueOnce({ successful: true, data: { results: [{ id: "123", title: "Refund policy" }] } } as never);
    const tools = await buildAgentTools(profile, "org-1");
    const out = await toolNamed(tools, CONFLUENCE_SEARCH_TOOL_NAME)!.invoke(undefined, JSON.stringify({ query: "refund" }));
    expect(executeToolMock).toHaveBeenCalledWith(
      CONFLUENCE_SEARCH_SLUG,
      { query: "refund", limit: 10 },
      { connectedAccountId: "ca_confluence_test", userId: "org-1", version: CONFLUENCE_TOOLKIT_VERSION },
    );
    expect(out).toContain("Refund policy");
  });

  it("reads a page as plain text and marks the turn as grounded", async () => {
    getConnectionMock.mockImplementation(async (_org, type) => (type === "knowledge_base" ? confluence() : null));
    executeToolMock.mockResolvedValueOnce({
      successful: true,
      data: {
        id: "123",
        title: "Refund policy",
        body: { storage: { value: "<h1>Refunds</h1><p>Within <strong>30 days</strong> &amp; unused.</p><ul><li>Card</li><li>Bank</li></ul>" } },
        _links: { webui: "/spaces/SUP/pages/123" },
      },
    } as never);
    const grounded = vi.fn();
    const tools = await buildAgentTools(profile, "org-1", null, grounded);
    const out = JSON.parse(await toolNamed(tools, CONFLUENCE_READ_TOOL_NAME)!.invoke(undefined, JSON.stringify({ pageId: "123" })));
    expect(executeToolMock).toHaveBeenCalledWith(CONFLUENCE_GET_PAGE_SLUG, { id: "123" }, expect.anything());
    expect(out.title).toBe("Refund policy");
    expect(out.text).toContain("Within 30 days & unused.");
    expect(out.text).toContain("- Card");
    expect(out.text).not.toContain("<");
    expect(grounded).toHaveBeenCalledTimes(1);
  });

  it("caps long pages and says so", async () => {
    getConnectionMock.mockImplementation(async (_org, type) => (type === "knowledge_base" ? confluence() : null));
    executeToolMock.mockResolvedValueOnce({
      successful: true,
      data: { id: "9", title: "Big", body: { storage: { value: `<p>${"x".repeat(CONFLUENCE_PAGE_TEXT_LIMIT + 500)}</p>` } } },
    } as never);
    const tools = await buildAgentTools(profile, "org-1");
    const out = JSON.parse(await toolNamed(tools, CONFLUENCE_READ_TOOL_NAME)!.invoke(undefined, JSON.stringify({ pageId: "9" })));
    expect(out.text.length).toBe(CONFLUENCE_PAGE_TEXT_LIMIT);
    expect(out.truncated).toBe(true);
  });

  it("retries once, then tells the model not to answer from memory", async () => {
    getConnectionMock.mockImplementation(async (_org, type) => (type === "knowledge_base" ? confluence() : null));
    executeToolMock.mockRejectedValue(new Error("401"));
    const grounded = vi.fn();
    const tools = await buildAgentTools(profile, "org-1", null, grounded);
    const out = await toolNamed(tools, CONFLUENCE_READ_TOOL_NAME)!.invoke(undefined, JSON.stringify({ pageId: "1" }));
    expect(out).toBe(CONFLUENCE_FAILURE_MESSAGE);
    expect(executeToolMock).toHaveBeenCalledTimes(2);
    expect(grounded).not.toHaveBeenCalled();
  });

  it("turns Confluence storage HTML into readable text", () => {
    expect(confluenceStorageToText("<p>a</p><p>b<br/>c</p><script>x()</script>")).toBe("a\nb\nc");
    expect(confluenceStorageToText("&lt;tag&gt; &quot;q&quot; it&#39;s&nbsp;ok")).toBe(`<tag> "q" it's ok`);
  });
});
