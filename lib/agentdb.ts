/**
 * AgentDB — internal AIX Core agent integration.
 *
 * Implements the server-to-server path from agentdb-aix
 * `docs/agent-integration-internal.md`. It is the *second* auth path on
 * AgentDB: not the human `Authorization: Bearer adb_…` workspace key from
 * Connect, but internal headers shared across AIX Core agent products.
 *
 *   X-Internal-Key   shared secret (server-only; never leaves this process)
 *   X-Clerk-Org-Id   the org's id, as AgentDB knows it
 *   X-Agent-Id       attribution label (caller_agent_label), not a permission
 *   X-Workspace-Id   optional; omit for the org's Default (oldest) workspace
 *
 * Two rules from the doc shape everything below:
 *
 *  1. `/resolve` is the only call that may provision, and it additionally
 *     requires a *user's* Clerk JWT. MCP never provisions — it 403s if the org
 *     was never enabled. This build has no Clerk (see lib/identity.ts), so the
 *     JWT is supplied once via AGENTDB_ENABLE_JWT purely to flip the org on.
 *     After that, MCP runs on internal headers alone, forever.
 *
 *  2. `get_agents_md` must be the first MCP tool call in a session. `query`
 *     and every write error until the live AGENTS.md has been loaded.
 *
 * Scope on this path is always *full* — SQL/DML/DDL, files, screens. This
 * worker deliberately does not use that ceiling: only `query` is exposed, and
 * `assertReadOnlySql` refuses anything that is not a single SELECT/WITH before
 * it is sent. A customer-facing chat worker must not be one prompt injection
 * away from a DROP TABLE.
 */

const DEFAULT_TIMEOUT_MS = 12000;
const MCP_PROTOCOL_VERSION = "2025-03-26";

export interface AgentDbWorkspace {
  id: string;
  name: string;
  visibility: string;
}

export interface AgentDbResolveResult {
  /** False = the org is not entitled to AgentDB in Core (a 200, not an error). */
  hasAccess: boolean;
  orgId: string;
  defaultWorkspaceId: string | null;
  workspaces: AgentDbWorkspace[];
}

export interface AgentDbQueryResult {
  sql: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  /** Raw text AgentDB returned, kept when the payload was not structured JSON. */
  text: string | null;
}

/** Distinguishes "AgentDB said no" from "AgentDB was unreachable". */
export class AgentDbError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "not_enabled"
      | "no_access"
      | "unavailable"
      | "readonly"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "AgentDbError";
  }
}

export function agentDbApiUrl(): string {
  return (process.env.AGENTDB_API_URL || "").trim().replace(/\/+$/, "");
}

function internalKey(): string {
  return (process.env.AGENTDB_INTERNAL_AGENT_KEY || "").trim();
}

/** One-time user Clerk JWT, used only by `/resolve`. Absent on most deploys. */
function enableJwt(): string {
  return (process.env.AGENTDB_ENABLE_JWT || "").trim();
}

export function hasEnableJwt(): boolean {
  return Boolean(enableJwt());
}

/** The label this worker files against `caller_agent_label` in AgentDB. */
export function agentDbAgentId(fallbackSlug: string): string {
  return (process.env.AGENTDB_AGENT_ID || "").trim() || fallbackSlug || "ai-worker";
}

/**
 * True when the server holds both halves of the credential. Without them the
 * integration is unavailable rather than merely disabled, and fails closed:
 * nothing is ever sent to AgentDB.
 */
export function isAgentDbConfigured(): boolean {
  return Boolean(agentDbApiUrl() && internalKey());
}

/**
 * The org id AgentDB knows this organization by.
 *
 * AgentDB keys orgs on `clerk_org_id`; this build has no Clerk, so the id is
 * configuration: an explicit per-worker override, else AGENTDB_ORG_ID, else the
 * local org id. Getting it wrong points the worker at another org's database,
 * so it is never guessed beyond this fallback chain.
 */
export function agentDbOrgId(localOrgId: string, override?: string | null): string {
  const explicit = (override || "").trim();
  if (explicit) return explicit;
  const fromEnv = (process.env.AGENTDB_ORG_ID || "").trim();
  if (fromEnv) return fromEnv;
  return localOrgId;
}

function internalHeaders(orgId: string, agentId: string, workspaceId?: string | null) {
  const headers: Record<string, string> = {
    "X-Internal-Key": internalKey(),
    "X-Clerk-Org-Id": orgId,
    "X-Agent-Id": agentId,
  };
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  return headers;
}

function requireConfigured() {
  if (!isAgentDbConfigured()) {
    throw new AgentDbError(
      "AgentDB is not configured on this server (AGENTDB_API_URL / AGENTDB_INTERNAL_AGENT_KEY)",
      null,
      "unconfigured",
    );
  }
}

/** Maps AgentDB's documented status table onto typed errors. */
function httpError(status: number, detail: string): AgentDbError {
  const trimmed = detail.slice(0, 300);
  if (status === 401) {
    return new AgentDbError(
      "AgentDB rejected the credential (bad internal key, missing org/agent id, JWT missing or org_mismatch, or the workspace is not org-visible)",
      401,
      "auth",
    );
  }
  if (status === 403) {
    // Both 403 cases in the doc. The body distinguishes them well enough to
    // tell "turn it on first" apart from "the whole path is switched off".
    const notEnabled = /not enabled/i.test(trimmed);
    return new AgentDbError(
      notEnabled
        ? "AgentDB has not been enabled for this organization yet — MCP never provisions, so it must be enabled first"
        : "AgentDB refused the request (INTERNAL_AGENT_KEY unset on the AgentDB service, or the org was never enabled)",
      403,
      notEnabled ? "not_enabled" : "auth",
    );
  }
  if (status === 503) {
    return new AgentDbError(
      "AgentDB could not reach AIX Core to check entitlement (fails closed)",
      503,
      "unavailable",
    );
  }
  return new AgentDbError(`AgentDB request failed: ${status} ${trimmed}`, status, "http");
}

async function agentDbFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  requireConfigured();
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${agentDbApiUrl()}${path}`, {
      ...rest,
      signal: controller.signal,
      // Next patches global fetch and will cache route-handler requests without
      // this. Cast: `cache` is not on the DOM RequestInit this project compiles against.
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AgentDbError(
      aborted ? `AgentDB did not respond within ${timeoutMs}ms` : "Could not reach AgentDB",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enable (toggle on) — the only call that may provision the org, and the only
 * one that takes a Clerk JWT.
 *
 * `has_access: false` comes back as a 200 and is *not* an error: it means the
 * org is simply not entitled to AgentDB in Core, which the settings screen
 * shows as a sentence rather than a failure.
 */
export async function resolveWorkspaces(
  orgId: string,
  agentId: string,
): Promise<AgentDbResolveResult> {
  const jwt = enableJwt();
  const res = await agentDbFetch(
    `/internal/orgs/${encodeURIComponent(orgId)}/workspaces/resolve`,
    {
      method: "POST",
      headers: {
        ...internalHeaders(orgId, agentId),
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify({ agent_id: agentId }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 && !jwt) {
      throw new AgentDbError(
        "AgentDB needs a user's Clerk JWT to enable an organization. This build has no Clerk — set AGENTDB_ENABLE_JWT once to turn the org on, or have it enabled from another AIX Core product. MCP itself never needs a JWT.",
        401,
        "auth",
      );
    }
    throw httpError(res.status, detail);
  }

  const data = (await res.json().catch(() => ({}))) as {
    has_access?: boolean;
    org_id?: string;
    default_workspace_id?: string | null;
    workspaces?: Array<{ id?: string; name?: string; visibility?: string }>;
  };

  return {
    hasAccess: data.has_access !== false,
    orgId: String(data.org_id ?? orgId),
    defaultWorkspaceId: data.default_workspace_id ?? null,
    workspaces: (data.workspaces ?? []).map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? "Untitled"),
      visibility: String(w.visibility ?? "org"),
    })),
  };
}

/** The org's live AGENTS.md — schema and house rules AgentDB wants read first. */
export async function fetchAgentsMd(options: {
  orgId: string;
  agentId: string;
  workspaceId?: string | null;
  timeoutMs?: number;
}): Promise<string> {
  const res = await agentDbFetch("/AGENTS.md", {
    method: "GET",
    headers: {
      ...internalHeaders(options.orgId, options.agentId, options.workspaceId),
      Accept: "text/markdown, text/plain, */*",
    },
    timeoutMs: options.timeoutMs,
  });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""));
  return await res.text();
}

/* ── MCP (Streamable HTTP) ──────────────────────────────────────────────────
 *
 * A tiny JSON-RPC client rather than an SDK dependency: this needs exactly
 * three calls (initialize, get_agents_md, query) and must send AgentDB's
 * internal headers on every request, which a stock MCP transport does not do.
 * Responses may come back as plain JSON or as a one-event SSE stream, so both
 * are parsed.
 */

interface JsonRpcResponse {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/** Pulls the JSON-RPC payload out of either a JSON body or an SSE stream. */
function parseRpcBody(contentType: string, body: string): JsonRpcResponse {
  const isEventStream = contentType.includes("text/event-stream");
  const raw = isEventStream
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .pop()
    : body.trim();

  if (!raw) {
    throw new AgentDbError("AgentDB returned an empty MCP response", null, "protocol");
  }
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new AgentDbError(
      `AgentDB returned an unreadable MCP response: ${raw.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

/**
 * An MCP session. AgentDB hands back a session id on initialize which must be
 * echoed on every later request, so the handshake is done once and reused for
 * the `get_agents_md` + `query` pair rather than per call.
 */
class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;
  private agentsMdLoaded = false;

  constructor(
    private readonly orgId: string,
    private readonly agentId: string,
    private readonly workspaceId: string | null,
    private readonly timeoutMs: number,
  ) {}

  private async rpc(method: string, params: Record<string, unknown>, notification = false) {
    const headers: Record<string, string> = {
      ...internalHeaders(this.orgId, this.agentId, this.workspaceId),
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const payload: Record<string, unknown> = { jsonrpc: "2.0", method, params };
    if (!notification) payload.id = this.nextId++;

    const res = await agentDbFetch("/mcp/", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      timeoutMs: this.timeoutMs,
    });

    const returned = res.headers.get("mcp-session-id");
    if (returned) this.sessionId = returned;

    if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""));
    // Notifications legitimately answer 202 with no body.
    if (notification || res.status === 202) return {};

    const parsed = parseRpcBody(
      res.headers.get("content-type") || "",
      await res.text().catch(() => ""),
    );
    if (parsed.error) {
      throw new AgentDbError(
        `AgentDB MCP error: ${parsed.error.message ?? "unknown"}`,
        null,
        "protocol",
      );
    }
    return parsed.result ?? {};
  }

  async open() {
    await this.rpc("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ai-worker", version: "1.0.0" },
    });
    // Best-effort: some servers require it, some answer 404 and work anyway.
    await this.rpc("notifications/initialized", {}, true).catch(() => undefined);
  }

  private async callTool(name: string, args: Record<string, unknown>) {
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError) {
      throw new AgentDbError(`AgentDB tool "${name}" failed: ${toText(result)}`, null, "protocol");
    }
    return result;
  }

  /** The doc's first-call rule. Idempotent, so callers need not track it. */
  async loadAgentsMd(): Promise<string> {
    const result = await this.callTool("get_agents_md", {});
    this.agentsMdLoaded = true;
    return toText(result);
  }

  async query(sql: string, limit: number): Promise<AgentDbQueryResult> {
    if (!this.agentsMdLoaded) await this.loadAgentsMd();
    const result = await this.callTool("query", { sql, limit });
    return shapeQueryResult(sql, result);
  }
}

/** MCP tool results are `{ content: [{type:"text", text}], structuredContent? }`. */
function toText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" ? String((part as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

function shapeQueryResult(sql: string, result: Record<string, unknown>): AgentDbQueryResult {
  const text = toText(result);
  const structured = (result.structuredContent ?? null) as Record<string, unknown> | null;

  // Prefer structured output; fall back to parsing the text block, which is
  // what servers without structured content return.
  let payload: Record<string, unknown> | null = structured;
  if (!payload && text.trim().startsWith("{")) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  const rows = Array.isArray(payload?.rows) ? (payload!.rows as Array<Record<string, unknown>>) : [];
  const columns = Array.isArray(payload?.columns)
    ? (payload!.columns as unknown[]).map(String)
    : rows.length > 0
      ? Object.keys(rows[0])
      : [];

  return {
    sql,
    columns,
    rows,
    rowCount: typeof payload?.row_count === "number" ? (payload.row_count as number) : rows.length,
    text: payload ? null : text || null,
  };
}

/**
 * Refuses anything that is not a single read.
 *
 * The internal path's scope is always full, so this is the only thing standing
 * between a model-authored string and the org's production data. It is
 * deliberately a whitelist (one statement, starts with SELECT or WITH) rather
 * than a blacklist of dangerous keywords — blacklists lose.
 */
export function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!trimmed) {
    throw new AgentDbError("No SQL was supplied", null, "readonly");
  }
  if (trimmed.includes(";")) {
    throw new AgentDbError(
      "Only a single statement is allowed — remove the semicolon and send one query",
      null,
      "readonly",
    );
  }
  if (!/^(select|with)\b/i.test(trimmed)) {
    throw new AgentDbError(
      "This worker may only read from AgentDB. Start the statement with SELECT or WITH.",
      null,
      "readonly",
    );
  }
  // `WITH … AS (INSERT … RETURNING)` is a writing CTE and slips past the prefix
  // check, so the data-modifying keywords are still refused inside a WITH.
  if (/^with\b/i.test(trimmed) && /\b(insert|update|delete|merge)\b/i.test(trimmed)) {
    throw new AgentDbError(
      "Data-modifying CTEs are not allowed — this worker may only read from AgentDB.",
      null,
      "readonly",
    );
  }
  return trimmed;
}

/** One-shot read. Opens a session, honours the AGENTS.md-first rule, queries. */
export async function queryAgentDb(options: {
  orgId: string;
  agentId: string;
  workspaceId?: string | null;
  sql: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<AgentDbQueryResult> {
  const sql = assertReadOnlySql(options.sql);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const session = new McpSession(
    options.orgId,
    options.agentId,
    options.workspaceId ?? null,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  await session.open();
  return session.query(sql, limit);
}

export interface AgentDbConnectionCheck {
  ok: boolean;
  /** True once MCP answered — i.e. the org is enabled and the headers work. */
  mcpReachable: boolean;
  agentsMdBytes: number;
  workspaceId: string | null;
  error: string | null;
  errorKind: AgentDbError["kind"] | null;
}

/**
 * "Test connection" for the settings screen: the cheapest call that proves the
 * whole internal path works end to end — MCP handshake plus the mandatory
 * `get_agents_md`. Never throws; the screen renders the failure.
 */
export async function checkAgentDbConnection(options: {
  orgId: string;
  agentId: string;
  workspaceId?: string | null;
  timeoutMs?: number;
}): Promise<AgentDbConnectionCheck> {
  const base = {
    mcpReachable: false,
    agentsMdBytes: 0,
    workspaceId: options.workspaceId ?? null,
  };
  try {
    const session = new McpSession(
      options.orgId,
      options.agentId,
      options.workspaceId ?? null,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    await session.open();
    const agentsMd = await session.loadAgentsMd();
    return {
      ...base,
      ok: true,
      mcpReachable: true,
      agentsMdBytes: agentsMd.length,
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof AgentDbError;
    return {
      ...base,
      ok: false,
      error: known ? error.message : "AgentDB connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
