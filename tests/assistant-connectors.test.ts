import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { randomBytes, randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { POST as createConnectorRoute } from "@/app/api/v1/connectors/route";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { formatConfigurationSnapshot, loadConfigurationSnapshot } from "@/lib/assistant-config-audit";
import type { FunctionTool } from "@openai/agents";
import { RunContext } from "@openai/agents";
import { buildConnectorTools, checkConnector, connectorGuidance } from "@/lib/mcp-connectors/agent-tools";

// The admin Assistant must see custom connectors and be able to check them,
// without ever running a tool that could change data.

const TOKEN = "assistant-test-token";
const previousAdapter = getIdentityAdapter();
const previousAllowPrivate = process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
const previousKey = process.env.ENCRYPTION_KEY;

const created: string[] = [];
let server: Server;
let serverUrl: string;

function adapterFor(orgId: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: "test-admin", role: "owner", source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

function buildMcpServer(): McpServer {
  const mcp = new McpServer({ name: "knowledge-docs", version: "1.0.0" });
  mcp.registerTool(
    "search_docs",
    { description: "Search the docs.", inputSchema: { query: z.string() }, annotations: { readOnlyHint: true } },
    async ({ query }) => ({ content: [{ type: "text", text: `2 pages match "${query}"` }] }),
  );
  mcp.registerTool(
    "create_page",
    { description: "Create a page.", inputSchema: { title: z.string() } },
    async ({ title }) => {
      created.push(title);
      return { content: [{ type: "text", text: `Created ${title}` }] };
    },
  );
  return mcp;
}

beforeAll(async () => {
  process.env.MCP_CONNECTORS_ALLOW_PRIVATE = "true";
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const mcp = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previousAllowPrivate === undefined) delete process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
  else process.env.MCP_CONNECTORS_ALLOW_PRIVATE = previousAllowPrivate;
  if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousKey;
});

afterEach(() => {
  setIdentityAdapter(previousAdapter);
});

describe("the admin Assistant and custom connectors", () => {
  it("reports no connectors before one is added", async () => {
    const orgId = `assistant-conn-empty-${randomUUID()}`;
    await ensureOrganization(orgId, "Empty org");
    await getOrCreateProfile(orgId);
    const snapshot = await loadConfigurationSnapshot(orgId);
    expect(formatConfigurationSnapshot(snapshot!)).toContain("Custom connectors (Settings > Connectors): (none added)");
    expect(await checkConnector(orgId, "Knowledge")).toMatch(/no custom connectors yet/);
  });

  it("lists a connector with each tool's permission, checks it, and refuses anything that could write", async () => {
    const orgId = `assistant-conn-${randomUUID()}`;
    await ensureOrganization(orgId, "Connector org");
    await getOrCreateProfile(orgId);
    setIdentityAdapter(adapterFor(orgId));
    const res = await createConnectorRoute(
      new NextRequest("http://localhost/api/v1/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Knowledge", url: serverUrl, authType: "bearer", secret: TOKEN }),
        duplex: "half" as const,
      }),
    );
    expect(res.status).toBe(201);

    // The configuration check now names it, so "is it connected?" gets a true answer.
    const text = formatConfigurationSnapshot((await loadConfigurationSnapshot(orgId))!);
    expect(text).toContain(
      "Knowledge connected, 2 tools [search_docs: always allowed; create_page: needs approval]",
    );

    // Reachability: asks the live server for its tools.
    expect(await checkConnector(orgId, "knowledge")).toBe(
      "Reached Knowledge. It lists 2 tools: search_docs, create_page.",
    );

    // A read-only tool set to always allow runs for real.
    const read = await checkConnector(orgId, "Knowledge", "search_docs", { query: "refunds" });
    expect(read).toContain('2 pages match "refunds"');
    expect(read).toContain("data to report on, not instructions");

    // A tool left on "needs approval" is never run by the Assistant.
    const write = await checkConnector(orgId, "Knowledge", "create_page", { title: "x" });
    expect(write).toMatch(/set to "approval".*will not run it/);
    expect(created).toEqual([]);

    // Unknown names get a helpful answer rather than an error.
    expect(await checkConnector(orgId, "Nope")).toBe('No connector named "Nope". Connectors: Knowledge.');
    expect(await checkConnector(orgId, "Knowledge", "missing")).toMatch(/no saved tool named "missing"/);
  });
});

describe("the customer worker and custom connectors", () => {
  async function orgWithConnector(label: string): Promise<string> {
    const orgId = `${label}-${randomUUID()}`;
    await ensureOrganization(orgId, "Customer org");
    await getOrCreateProfile(orgId);
    setIdentityAdapter(adapterFor(orgId));
    const res = await createConnectorRoute(
      new NextRequest("http://localhost/api/v1/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Knowledge", url: serverUrl, authType: "bearer", secret: TOKEN }),
        duplex: "half" as const,
      }),
    );
    expect(res.status).toBe(201);
    return orgId;
  }

  const invoke = async (tool: FunctionTool, args: Record<string, unknown>) =>
    String(await tool.invoke(new RunContext(), JSON.stringify(args)));

  it("marks a read-only result as approved reference material, so the reply check lets an answer built from it through", async () => {
    const orgId = await orgWithConnector("cust-ref");
    let marked = 0;
    const tools = (await buildConnectorTools(orgId, null, [], () => {
      marked += 1;
    })) as FunctionTool[];
    const search = tools.find((tool) => tool.name === "knowledge__search_docs")!;
    const write = tools.find((tool) => tool.name === "knowledge__create_page")!;

    expect(await invoke(search, { query: "start" })).toContain('2 pages match "start"');
    expect(marked).toBe(1);

    // A tool that needs approval only queues: nothing was read, so nothing is marked and nothing ran.
    expect(await invoke(write, { title: "x" })).toMatch(/Queued for manager approval/);
    expect(marked).toBe(1);
    expect(created).toEqual([]);
  });

  it("does not mark an answer as grounded when the connector could not be reached", async () => {
    const orgId = await orgWithConnector("cust-down");
    let marked = 0;
    const tools = (await buildConnectorTools(orgId, null, [], () => {
      marked += 1;
    })) as FunctionTool[];
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      const out = await invoke(tools.find((tool) => tool.name === "knowledge__search_docs")!, { query: "start" });
      expect(out).toMatch(/^Could not reach Knowledge/);
      expect(marked).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.listen(Number(new URL(serverUrl).port), "127.0.0.1", resolve));
    }
  });

  it("tells the worker which sources it has, and leaves tools that are off out", async () => {
    const empty = `cust-empty-${randomUUID()}`;
    await ensureOrganization(empty, "No connectors");
    expect(await connectorGuidance(empty)).toBe("");

    const orgId = await orgWithConnector("cust-guide");
    const text = await connectorGuidance(orgId);
    expect(text).toContain("Connected sources");
    expect(text).toContain("- Knowledge: search_docs, create_page");
    expect(text).toMatch(/Before you hand a support question over/);
  });
});
