import type { KnowledgeMatch } from "@/lib/knowledge";

/**
 * Agent Wiki — the organization's wiki spaces, over MCP.
 *
 * Auth is the same shape as Scribe's, and the simplest of the set: one API key
 * as a bearer token against one endpoint, no internal-key headers, no Clerk
 * JWT, no workspace resolution.
 *
 *   Authorization: Bearer <agent wiki key>
 *
 * Two things are worth knowing before changing anything here.
 *
 *  1. **The key carries its own ceiling.** Agent Wiki issues a key against the
 *     person who created it: it holds their role in each space and can hold
 *     less. A key created without write permission is refused by the server
 *     when it tries to write, whatever the worker's settings say. So there are
 *     two independent brakes on writing — the key's own permission, and this
 *     worker's `allowWrite` toggle — and the server's is the one that is
 *     authoritative. `allowWrite` never grants anything; it only withholds.
 *
 *  2. **The tool surface is discovered, never hardcoded.** The staging service
 *     publishes no schema unauthenticated, and a wiki's tool names are exactly
 *     the sort of thing that gets renamed. `listTools` asks the server, and
 *     `resolveSearchTool` picks the search tool out of that answer by name, so
 *     a rename surfaces on the settings screen instead of failing silently at
 *     chat time.
 *
 * The key is a server-only secret: never returned from an API route, never
 * logged, never shipped to a browser.
 */

const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Tool-name shapes that change a page rather than only reading one.
 *
 * Matched as substrings against the discovered names because the surface is
 * not fixed here the way `artifacts.ts` can fix its own. Deliberately broad:
 * mistaking a read tool for a write tool costs a disabled button, while the
 * reverse would let a worker edit the wiki with writing switched off.
 */
const WRITE_TOOL_PATTERNS = [
  "create",
  "update",
  "edit",
  "write",
  "delete",
  "remove",
  "rename",
  "move",
  "publish",
  "append",
  "upload",
  "archive",
  "restore",
];

/** Preferred first — the search tool is whichever of these the server has. */
const SEARCH_TOOL_CANDIDATES = [
  "search_pages",
  "search_wiki",
  "search",
  "query_pages",
  "find_pages",
  "list_pages",
];

export interface AgentWikiTool {
  name: string;
  description: string;
  /** True when the tool changes a page rather than only reading it. */
  writes: boolean;
}

export interface AgentWikiSpace {
  id: string;
  name: string;
  /** The role this key holds in the space, when the server reports one. */
  role: string | null;
  pageCount: number | null;
}

export interface AgentWikiPage {
  id: string;
  title: string;
  spaceId: string | null;
  spaceName: string | null;
  url: string | null;
  excerpt: string;
  updatedAt: string | null;
}

/** Distinguishes "Agent Wiki said no" from "Agent Wiki was unreachable". */
export class AgentWikiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "forbidden"
      | "read_only"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "AgentWikiError";
  }
}

export function agentWikiMcpUrl(): string {
  return (process.env.AGENT_WIKI_MCP_URL || "").trim().replace(/\/+$/, "");
}

function agentWikiKey(): string {
  return (process.env.AGENT_WIKI_API_KEY || "").trim();
}

/**
 * The label shown for the key on the settings screen — what created it, not
 * its value. Display only; never sent.
 */
export function agentWikiKeyLabel(): string | null {
  return (process.env.AGENT_WIKI_KEY_LABEL || "").trim() || null;
}

/**
 * True when the server holds both halves of the credential. Without them the
 * integration is unavailable rather than merely disabled, and fails closed:
 * nothing is ever sent to Agent Wiki.
 */
export function isAgentWikiConfigured(): boolean {
  return Boolean(agentWikiMcpUrl() && agentWikiKey());
}

/** Classifies a discovered tool by what its name says it does. */
export function toolWrites(name: string): boolean {
  const lower = name.toLowerCase();
  return WRITE_TOOL_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * The search tool, chosen from what the server actually exposes.
 *
 * Falls back to the first read-only tool whose name mentions searching, so a
 * server that names it something unanticipated still works.
 */
export function resolveSearchTool(tools: AgentWikiTool[]): string | null {
  const names = tools.map((tool) => tool.name);
  for (const candidate of SEARCH_TOOL_CANDIDATES) {
    if (names.includes(candidate)) return candidate;
  }
  const fuzzy = tools.find((tool) => !tool.writes && /search|find|query/i.test(tool.name));
  return fuzzy ? fuzzy.name : null;
}

interface JsonRpcResponse {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/** Streamable HTTP permits a plain JSON body or an SSE stream — accept both. */
function parseRpcBody(contentType: string, body: string): JsonRpcResponse {
  const raw = contentType.includes("text/event-stream")
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .pop()
    : body.trim();

  if (!raw) throw new AgentWikiError("Agent Wiki returned an empty response", null, "protocol");
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new AgentWikiError(
      `Agent Wiki returned an unreadable response: ${raw.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

let nextId = 1;

async function agentWikiRpc(
  method: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  if (!isAgentWikiConfigured()) {
    throw new AgentWikiError(
      "Agent Wiki is not configured on this server (AGENT_WIKI_MCP_URL / AGENT_WIKI_API_KEY)",
      null,
      "unconfigured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(agentWikiMcpUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentWikiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      signal: controller.signal,
      // Next patches global fetch and will cache route-handler requests without
      // this. Cast: `cache` is not on the DOM RequestInit this project compiles against.
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AgentWikiError(
      aborted ? `Agent Wiki did not respond within ${timeoutMs}ms` : "Could not reach Agent Wiki",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) {
      throw new AgentWikiError(
        "Agent Wiki rejected the key (AGENT_WIKI_API_KEY). Create a new one under Settings > API keys.",
        401,
        "auth",
      );
    }
    if (res.status === 403) {
      // A read-only key refused a write is the one 403 a manager can fix
      // themselves, so it is worth separating from "no access to that space".
      const readOnly = /read[- ]?only|cannot write|write.*not allowed/i.test(detail);
      throw new AgentWikiError(
        readOnly
          ? "Agent Wiki refused the write — this key was created without permission to change pages."
          : "Agent Wiki refused the request — this key may not reach that space.",
        403,
        readOnly ? "read_only" : "forbidden",
      );
    }
    throw new AgentWikiError(
      `Agent Wiki request failed: ${res.status} ${detail}`,
      res.status,
      "http",
    );
  }

  const parsed = parseRpcBody(
    res.headers.get("content-type") || "",
    await res.text().catch(() => ""),
  );
  if (parsed.error) {
    throw new AgentWikiError(
      `Agent Wiki error: ${parsed.error.message ?? "unknown"}`,
      null,
      "protocol",
    );
  }
  return parsed.result ?? {};
}

/** MCP tool results are `{ content: [{type:"text", text}], isError }`. */
function toolText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" ? String((part as { text?: unknown }).text ?? "") : "",
    )
    .filter(Boolean)
    .join("\n");
}

/** Agent Wiki returns its payloads as a JSON string inside the text block. */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<Record<string, unknown>> {
  const result = await agentWikiRpc("tools/call", { name, arguments: args }, timeoutMs);
  const text = toolText(result);
  if (result.isError) {
    // The server reports a read-only refusal in the tool result, not only as a
    // 403, so the same distinction has to be drawn here too.
    const readOnly = /read[- ]?only|cannot write|permission/i.test(text);
    throw new AgentWikiError(
      readOnly
        ? `Agent Wiki refused "${name}" — this key was created without permission to change pages.`
        : `Agent Wiki tool "${name}" failed: ${text.slice(0, 200)}`,
      null,
      readOnly ? "read_only" : "protocol",
    );
  }
  if (!text.trim().startsWith("{")) return { text };
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function optional(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The live tool surface.
 *
 * Both the cheapest proof the key works and the list everything else here is
 * built from — `resolveSearchTool` reads it, and the settings screen shows it
 * so a manager can see what the key can actually do before switching it on.
 */
export async function listTools(timeoutMs?: number): Promise<AgentWikiTool[]> {
  const result = await agentWikiRpc("tools/list", {}, timeoutMs);
  const tools = Array.isArray(result.tools) ? (result.tools as Array<Record<string, unknown>>) : [];
  return tools.map((tool) => {
    const name = str(tool.name);
    return {
      name,
      description: str(tool.description).trim(),
      writes: toolWrites(name),
    };
  });
}

/** Rows come back under any of these keys depending on the tool. */
function rowsFrom(data: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return [];
}

/** The spaces this key can reach — used by the settings screen to scope search. */
export async function listSpaces(timeoutMs?: number): Promise<AgentWikiSpace[]> {
  const data = await callTool("list_spaces", {}, timeoutMs);
  return rowsFrom(data, ["spaces", "items", "results"]).map((space) => ({
    id: str(space.id),
    name: str(space.name) || "Untitled space",
    role: optional(space.role),
    pageCount: num(space.page_count ?? space.pages),
  }));
}

/**
 * Search the wiki.
 *
 * The tool name is resolved from the server's own surface rather than assumed,
 * so this takes one extra round trip on a cold call. That is the right trade:
 * a wrong hardcoded name would fail every message silently.
 */
export async function searchWiki(options: {
  query: string;
  spaceId?: string | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<AgentWikiPage[]> {
  const tools = await listTools(options.timeoutMs);
  const toolName = resolveSearchTool(tools);
  if (!toolName) {
    throw new AgentWikiError(
      "Agent Wiki exposes no search tool on this key",
      null,
      "protocol",
    );
  }

  const limit = Math.min(20, Math.max(1, options.limit ?? 5));
  const data = await callTool(
    toolName,
    {
      query: options.query,
      limit,
      ...(options.spaceId ? { space_id: options.spaceId } : {}),
    },
    options.timeoutMs,
  );

  return rowsFrom(data, ["results", "pages", "items"])
    .map((page) => ({
      id: str(page.id),
      title: str(page.title) || "Untitled page",
      spaceId: optional(page.space_id),
      spaceName: optional(page.space_name),
      url: optional(page.url),
      excerpt: str(page.excerpt ?? page.content ?? page.text),
      updatedAt: optional(page.updated_at),
    }))
    .slice(0, limit);
}

/**
 * Shapes wiki pages like local knowledge chunks so every source can be handed
 * to the agent as one list.
 *
 * Ids are prefixed so a wiki page can never be mistaken for a local
 * `knowledge_documents` row. Rank descends with position because the server
 * returns pages already ordered by its own relevance, and that ordering is not
 * comparable with Postgres `ts_rank` — retrieval round-robins rather than
 * sorting across sources for exactly that reason.
 */
export function toKnowledgeMatches(pages: AgentWikiPage[], limit: number): KnowledgeMatch[] {
  const matches: KnowledgeMatch[] = [];
  for (const [index, page] of pages.entries()) {
    if (matches.length >= limit) break;
    if (!page.excerpt.trim()) continue;
    matches.push({
      documentId: `agent-wiki:${page.id}`,
      title: page.title,
      heading: page.spaceName,
      content: page.excerpt,
      rank: 1 / (index + 1),
    });
  }
  return matches;
}

export interface AgentWikiConnectionCheck {
  ok: boolean;
  toolCount: number;
  tools: AgentWikiTool[];
  spaces: AgentWikiSpace[];
  /** Whether the key itself can write, per the tools it was granted. */
  canWrite: boolean;
  searchTool: string | null;
  error: string | null;
  errorKind: AgentWikiError["kind"] | null;
}

/**
 * "Test connection" for the settings screen: the tool surface plus the spaces,
 * which together prove the key is valid *and* reaches real content. The tool
 * list also settles whether the key can write at all, which is the thing the
 * screen most needs to say out loud.
 *
 * Never throws; the screen renders the failure.
 */
export async function checkAgentWikiConnection(
  timeoutMs?: number,
): Promise<AgentWikiConnectionCheck> {
  try {
    const tools = await listTools(timeoutMs);
    // Spaces may sit behind their own permission, so a key can list tools and
    // still fail here. That is information, not a failed test.
    const spaces = await listSpaces(timeoutMs).catch(() => [] as AgentWikiSpace[]);
    return {
      ok: true,
      toolCount: tools.length,
      tools,
      spaces,
      canWrite: tools.some((tool) => tool.writes),
      searchTool: resolveSearchTool(tools),
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof AgentWikiError;
    return {
      ok: false,
      toolCount: 0,
      tools: [],
      spaces: [],
      canWrite: false,
      searchTool: null,
      error: known ? error.message : "Agent Wiki connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
