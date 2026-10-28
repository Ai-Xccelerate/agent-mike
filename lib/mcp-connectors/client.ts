import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpConnectorTool } from "@/db/schema";
import { assertPublicUrl } from "@/lib/mcp-connectors/url-safety";

/**
 * A short-lived MCP client per operation: connect, do one thing, close.
 *
 * Holding sessions open across requests would mean a pool keyed by org and
 * connector, reconnect logic, and sessions outliving the admin's settings
 * change. A connector call already costs a model turn, so the extra handshake
 * is noise, and every call sees the connector exactly as it is saved now.
 *
 * Streamable HTTP is tried first (the current MCP transport); servers that
 * only speak the older HTTP+SSE transport get a second attempt with it.
 */

export type ConnectorEndpoint = {
  url: string;
  /** Already-decrypted auth headers. Never logged, never returned. */
  headers: Record<string, string>;
};

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;
const RESULT_TEXT_LIMIT = 20_000;
const CLIENT_INFO = { name: "aix-ai-worker", version: "1.0.0" };

/** Re-checks every URL the transport fetches, including redirects and SSE message endpoints. */
const guardedFetch: typeof fetch = async (input, init) => {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  await assertPublicUrl(target);
  return fetch(input, init);
};

async function connect(endpoint: ConnectorEndpoint): Promise<Client> {
  const url = new URL(endpoint.url);
  await assertPublicUrl(url);
  const requestInit: RequestInit = { headers: endpoint.headers };

  const client = new Client(CLIENT_INFO);
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit, fetch: guardedFetch }), {
      timeout: CONNECT_TIMEOUT_MS,
    });
    return client;
  } catch (streamableError) {
    await client.close().catch(() => undefined);
    const legacy = new Client(CLIENT_INFO);
    try {
      await legacy.connect(
        new SSEClientTransport(url, {
          requestInit,
          fetch: guardedFetch,
          eventSourceInit: { fetch: (u, i) => guardedFetch(u, { ...i, headers: { ...i?.headers, ...endpoint.headers } }) },
        }),
        { timeout: CONNECT_TIMEOUT_MS },
      );
      return legacy;
    } catch {
      await legacy.close().catch(() => undefined);
      throw streamableError;
    }
  }
}

async function withClient<T>(endpoint: ConnectorEndpoint, run: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(endpoint);
  try {
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export type DiscoveredServer = {
  serverName: string | null;
  tools: McpConnectorTool[];
};

/** Connects, reads the server's name and its full tool list (all pages). */
export async function discoverTools(endpoint: ConnectorEndpoint): Promise<DiscoveredServer> {
  return withClient(endpoint, async (client) => {
    const tools: McpConnectorTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CONNECT_TIMEOUT_MS });
      for (const entry of page.tools) {
        tools.push({
          name: entry.name,
          description: (entry.description || entry.annotations?.title || "").trim(),
          inputSchema: (entry.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
          readOnly: entry.annotations?.readOnlyHint === true,
          destructive: entry.annotations?.destructiveHint === true,
        });
      }
      cursor = page.nextCursor;
    } while (cursor && tools.length < 500);
    return { serverName: client.getServerVersion()?.name ?? null, tools };
  });
}

export type ToolCallOutcome = { ok: boolean; text: string };

/** Flattens an MCP tool result to text the model can read; non-text parts are described, not dropped silently. */
export function resultToText(raw: unknown): string {
  const result = (raw ?? {}) as { content?: unknown; structuredContent?: unknown; toolResult?: unknown };
  const parts: string[] = [];
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content as Array<Record<string, unknown>>) {
    if (item.type === "text" && typeof item.text === "string") parts.push(item.text);
    else if (item.type === "resource" && item.resource && typeof (item.resource as { text?: unknown }).text === "string") {
      parts.push((item.resource as { text: string }).text);
    } else if (item.type === "resource_link" && typeof item.uri === "string") parts.push(`[resource] ${item.uri}`);
    else if (typeof item.type === "string") parts.push(`[${item.type} content omitted]`);
  }
  if (parts.length === 0 && result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  // Pre-2024-11 servers answer with a bare `toolResult` instead of content parts.
  if (parts.length === 0 && result.toolResult !== undefined) {
    parts.push(typeof result.toolResult === "string" ? result.toolResult : JSON.stringify(result.toolResult));
  }
  const text = parts.join("\n").trim() || "(the tool returned no content)";
  return text.length > RESULT_TEXT_LIMIT ? `${text.slice(0, RESULT_TEXT_LIMIT)}\n…(truncated)` : text;
}

export async function callConnectorTool(
  endpoint: ConnectorEndpoint,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  return withClient(endpoint, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
    return { ok: (result as { isError?: unknown }).isError !== true, text: resultToText(result) };
  });
}

/** A message an admin can act on, without echoing headers or anything secret. */
export function describeConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthori[sz]ed|forbidden/i.test(message)) {
    return "The server refused the credentials. Check the token or header and try again.";
  }
  if (/404/.test(message)) return "No MCP server answered at that URL. Check the path, often /mcp or /sse.";
  if (/timed? ?out|timeout/i.test(message)) return "The server did not answer in time.";
  if (/ENOTFOUND|Could not find a server/i.test(message)) return message.includes("Could not find") ? message : "Could not find that server.";
  if (/public internet|https|credentials in the/i.test(message)) return message;
  return "Could not connect to this MCP server.";
}
