import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { randomBytes, randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { RunContext } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { z } from "zod";
import { GET as listConnectorsRoute, POST as createConnectorRoute } from "@/app/api/v1/connectors/route";
import { DELETE as deleteConnectorRoute, PATCH as patchConnectorRoute } from "@/app/api/v1/connectors/[id]/route";
import { POST as refreshConnectorRoute } from "@/app/api/v1/connectors/[id]/refresh/route";
import { PATCH as decideApprovalRoute } from "@/app/api/v1/approvals/[id]/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter, type TenantContext } from "@/lib/identity";
import { getApproval } from "@/lib/tools-integrations/approval-repository";
import {
  agentToolName,
  buildConnectorTools,
  connectorApprovalToolId,
  parseConnectorApprovalToolId,
  toolParameters,
} from "@/lib/mcp-connectors/agent-tools";
import { resultToText } from "@/lib/mcp-connectors/client";
import { defaultPermission, mergePermissions } from "@/lib/mcp-connectors/repository";
import { assertPublicUrl, isPrivateAddress, parseConnectorUrl } from "@/lib/mcp-connectors/url-safety";

const TOKEN = "test-token-123";
const previousAdapter = getIdentityAdapter();
const previousAllowPrivate = process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
const previousKey = process.env.ENCRYPTION_KEY;

function adapterFor(orgId: string, role: TenantContext["role"] = "owner"): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: "test-admin", role, source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

function jsonRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body), duplex: "half" as const }),
  });
}

async function readJson(res: Response) {
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
}

async function invoke(tool: FunctionTool, args: Record<string, unknown>): Promise<string> {
  return String(await tool.invoke(new RunContext(), JSON.stringify(args)));
}

// ── A real MCP server (Streamable HTTP, stateless) that wants a bearer token ──

const createdTickets: string[] = [];
let server: Server;
let serverUrl: string;

function buildMcpServer(): McpServer {
  const mcp = new McpServer({ name: "acme-tickets", version: "1.0.0" });
  mcp.registerTool(
    "search_tickets",
    {
      description: "Search tickets by keyword.",
      inputSchema: { query: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => ({ content: [{ type: "text", text: `Found 1 ticket for "${query}": ACME-7` }] }),
  );
  mcp.registerTool(
    "create_ticket",
    { description: "Create a ticket.", inputSchema: { title: z.string() } },
    async ({ title }) => {
      createdTickets.push(title);
      return { content: [{ type: "text", text: `Created ACME-${createdTickets.length + 7}: ${title}` }] };
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

describe("connector URL safety", () => {
  it("refuses http, embedded credentials and junk", () => {
    const saved = process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
    delete process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
    try {
      expect(() => parseConnectorUrl("http://example.com/mcp")).toThrow(/https/);
      expect(() => parseConnectorUrl("https://user:pw@example.com/mcp")).toThrow(/credentials/);
      expect(() => parseConnectorUrl("not a url")).toThrow();
      expect(parseConnectorUrl(" https://mcp.example.com/mcp#x ").href).toBe("https://mcp.example.com/mcp");
    } finally {
      process.env.MCP_CONNECTORS_ALLOW_PRIVATE = saved;
    }
  });

  it("treats private, loopback, link-local and metadata addresses as private", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("refuses hosts that resolve to private addresses", async () => {
    const saved = process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
    delete process.env.MCP_CONNECTORS_ALLOW_PRIVATE;
    try {
      await expect(assertPublicUrl(new URL("https://127.0.0.1/mcp"))).rejects.toThrow(/public internet/);
      await expect(assertPublicUrl(new URL("https://localhost/mcp"))).rejects.toThrow(/public internet/);
      await expect(assertPublicUrl(new URL("https://[::1]/mcp"))).rejects.toThrow(/public internet/);
    } finally {
      process.env.MCP_CONNECTORS_ALLOW_PRIVATE = saved;
    }
  });
});

describe("connector tool helpers", () => {
  const readTool = { name: "read", description: "", inputSchema: {}, readOnly: true, destructive: false };
  const writeTool = { name: "write", description: "", inputSchema: {}, readOnly: false, destructive: false };

  it("defaults read-only tools to auto and everything else to approval", () => {
    expect(defaultPermission(readTool)).toBe("auto");
    expect(defaultPermission(writeTool)).toBe("approval");
    expect(defaultPermission({ ...readTool, destructive: true })).toBe("approval");
  });

  it("keeps existing decisions, defaults new tools, and drops removed ones", () => {
    expect(mergePermissions([readTool, writeTool], { write: "auto", gone: "auto" })).toEqual({ read: "auto", write: "auto" });
  });

  it("builds unique, valid model-facing tool names", () => {
    const taken = new Set(["lookup_crm"]);
    const first = agentToolName("Acme Tickets!", "create.ticket", taken);
    const second = agentToolName("Acme Tickets!", "create.ticket", taken);
    expect(first).toBe("acme_tickets__create_ticket");
    expect(second).not.toBe(first);
    const long = agentToolName("x".repeat(80), "y".repeat(80), taken);
    expect(long.length).toBeLessThanOrEqual(64);
    for (const name of [first, second, long]) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("normalizes free-form input schemas", () => {
    expect(toolParameters({})).toMatchObject({ type: "object", properties: {}, required: [] });
    expect(toolParameters({ type: "object", properties: { a: { type: "string" } }, required: ["a", "missing"] }).required).toEqual(["a"]);
  });

  it("round-trips approval tool ids, including tool names with colons", () => {
    const id = connectorApprovalToolId("abc", "ns:tool");
    expect(parseConnectorApprovalToolId(id)).toEqual({ connectorId: "abc", toolName: "ns:tool" });
    expect(parseConnectorApprovalToolId("gmail_send_email")).toBeNull();
  });

  it("flattens MCP results to text", () => {
    expect(resultToText({ content: [{ type: "text", text: "a" }, { type: "image", data: "", mimeType: "image/png" }] })).toBe(
      "a\n[image content omitted]",
    );
    expect(resultToText({ content: [], structuredContent: { n: 1 } })).toBe('{"n":1}');
    expect(resultToText({ toolResult: "legacy" })).toBe("legacy");
  });
});

describe("connectors end to end against a live MCP server", () => {
  const orgId = `mcp-test-${randomUUID()}`;

  it("adds, discovers, runs, queues, approves, switches off and removes", async () => {
    await ensureOrganization(orgId, "MCP test org");
    setIdentityAdapter(adapterFor(orgId));

    // Wrong token: refused with a reason, nothing saved.
    const refused = await readJson(
      await createConnectorRoute(
        jsonRequest("POST", "http://localhost/api/v1/connectors", {
          name: "Acme tickets",
          url: serverUrl,
          authType: "bearer",
          secret: "wrong",
        }),
      ),
    );
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatch(/refused the credentials/);

    // A member can read but not add.
    setIdentityAdapter(adapterFor(orgId, "member"));
    const memberAdd = await createConnectorRoute(
      jsonRequest("POST", "http://localhost/api/v1/connectors", { name: "x", url: serverUrl }),
    );
    expect(memberAdd.status).toBe(403);
    setIdentityAdapter(adapterFor(orgId));

    const created = await readJson(
      await createConnectorRoute(
        jsonRequest("POST", "http://localhost/api/v1/connectors", {
          name: "Acme tickets",
          url: serverUrl,
          authType: "bearer",
          secret: TOKEN,
        }),
      ),
    );
    expect(created.status).toBe(201);
    expect(created.body.serverName).toBe("acme-tickets");
    expect(created.body.hasSecret).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain(TOKEN);
    const permissions = Object.fromEntries(
      (created.body.tools as Array<{ name: string; permission: string }>).map((tool) => [tool.name, tool.permission]),
    );
    expect(permissions).toEqual({ search_tickets: "auto", create_ticket: "approval" });
    const connectorId = created.body.id as string;

    // The agent gets both tools; the auto one runs for real.
    const tools = (await buildConnectorTools(orgId, null)) as FunctionTool[];
    const search = tools.find((tool) => tool.name === "acme_tickets__search_tickets")!;
    const create = tools.find((tool) => tool.name === "acme_tickets__create_ticket")!;
    expect(search).toBeDefined();
    expect(create.description).toMatch(/queued for a manager to approve/);
    expect(await invoke(search, { query: "login" })).toBe('Found 1 ticket for "login": ACME-7');

    // The approval one queues and does not run.
    const queued = await invoke(create, { title: "Printer on fire" });
    expect(queued).toMatch(/Queued for manager approval/);
    expect(createdTickets).toEqual([]);

    const listed = await readJson(await listConnectorsRoute(jsonRequest("GET", "http://localhost/api/v1/connectors")));
    expect(listed.body.pendingApprovals).toHaveLength(1);
    expect(listed.body.pendingApprovals[0]).toMatchObject({ connectorName: "Acme tickets", toolName: "create_ticket" });
    const approvalId = listed.body.pendingApprovals[0].id as string;

    // Approving runs it for real and stores the outcome.
    const approved = await readJson(
      await decideApprovalRoute(
        jsonRequest("PATCH", `http://localhost/api/v1/approvals/${approvalId}`, { decision: "approved" }),
        { params: { id: approvalId } },
      ),
    );
    expect(approved.status).toBe(200);
    expect(approved.body.applied).toEqual({ ok: true, output: "Created ACME-8: Printer on fire" });
    expect(createdTickets).toEqual(["Printer on fire"]);
    expect((await getApproval(approvalId))?.result).toEqual({ output: "Created ACME-8: Printer on fire" });

    // Queue another, then switch the tool off: the tool disappears and the queued call is retired.
    await invoke(create, { title: "Second" });
    const off = await readJson(
      await patchConnectorRoute(
        jsonRequest("PATCH", `http://localhost/api/v1/connectors/${connectorId}`, {
          toolPermissions: { create_ticket: "off" },
        }),
        { params: { id: connectorId } },
      ),
    );
    expect(off.status).toBe(200);
    expect((await buildConnectorTools(orgId, null)).map((tool) => tool.name)).toEqual(["acme_tickets__search_tickets"]);
    const afterOff = await readJson(await listConnectorsRoute(jsonRequest("GET", "http://localhost/api/v1/connectors")));
    expect(afterOff.body.pendingApprovals).toHaveLength(0);
    expect(createdTickets).toEqual(["Printer on fire"]);

    // Unknown tool names are refused.
    const unknown = await patchConnectorRoute(
      jsonRequest("PATCH", `http://localhost/api/v1/connectors/${connectorId}`, { toolPermissions: { nope: "auto" } }),
      { params: { id: connectorId } },
    );
    expect(unknown.status).toBe(422);

    // Refresh keeps the admin's decisions.
    const refreshed = await readJson(
      await refreshConnectorRoute(jsonRequest("POST", `http://localhost/api/v1/connectors/${connectorId}/refresh`), {
        params: { id: connectorId },
      }),
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.tools.find((tool: { name: string }) => tool.name === "create_ticket").permission).toBe("off");

    // Switching the whole connector off removes all of its tools.
    await patchConnectorRoute(
      jsonRequest("PATCH", `http://localhost/api/v1/connectors/${connectorId}`, { enabled: false }),
      { params: { id: connectorId } },
    );
    expect(await buildConnectorTools(orgId, null)).toHaveLength(0);

    const removed = await deleteConnectorRoute(jsonRequest("DELETE", `http://localhost/api/v1/connectors/${connectorId}`), {
      params: { id: connectorId },
    });
    expect(removed.status).toBe(204);
    const empty = await readJson(await listConnectorsRoute(jsonRequest("GET", "http://localhost/api/v1/connectors")));
    expect(empty.body.connectors).toEqual([]);
  });
});
