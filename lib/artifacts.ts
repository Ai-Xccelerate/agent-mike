/**
 * Agent Artifacts — AI Xccelerate Artifact Engine, over MCP.
 *
 * Auth is one workspace bearer token against one endpoint:
 *
 *   Authorization: Bearer aix_mcp_…
 *
 * Two things make it different from the other three integrations:
 *
 *  1. **It writes.** Parchment, Scribe and this worker's AgentDB access are all
 *     read paths. Artifacts creates, publishes and delivers decks and documents
 *     that land in the workspace library and count against its quota. The token
 *     is a *workspace* credential, so anything the worker makes belongs to the
 *     workspace, not a person — hence default-off, and a separate opt-in before
 *     it may publish anything to a live URL.
 *
 *  2. **It is a capability, not a knowledge source.** Nothing here feeds
 *     retrieval. `listTools` discovers the surface from the server rather than
 *     hardcoding it, so a tool renamed upstream surfaces on the settings screen
 *     instead of failing silently at chat time.
 *
 * ── Protocol note (MCP revision 2026-07-28) ──────────────────────────────────
 *
 * This revision is stricter than the one Scribe speaks, and all three rules
 * below were confirmed against the live staging service rather than assumed:
 *
 *   - There is **no `initialize`** — it answers "Method not found". The server
 *     is stateless and issues no session id, so every call stands alone.
 *   - Every request's `params` must carry a `_meta` envelope holding
 *     `io.modelcontextprotocol/protocolVersion` and
 *     `io.modelcontextprotocol/clientCapabilities`.
 *   - The method — and for `tools/call` the tool name — must be repeated in
 *     `mcp-method` / `mcp-name` headers, and must match the body exactly.
 *
 * The token is a server-only secret: never returned from an API route, never
 * logged, never shipped to a browser.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const MCP_PROTOCOL_VERSION = "2026-07-28";

/** Tools that create, change, publish or send something. */
export const WRITING_TOOLS = [
  "create_artifact",
  "update_artifact",
  "publish_artifact",
  "export_artifact",
  "deliver_artifact",
] as const;

/** Tools that put an artifact in front of someone outside the workspace. */
export const PUBLISHING_TOOLS = ["publish_artifact", "deliver_artifact"] as const;

export interface ArtifactsTool {
  name: string;
  description: string;
  /** True when the tool changes state rather than only reading it. */
  writes: boolean;
}

export interface ArtifactsBrandKit {
  id: string;
  name: string;
  isDefault: boolean;
  usable: boolean;
}

/** Distinguishes "Artifacts said no" from "Artifacts was unreachable". */
export class ArtifactsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "revoked"
      | "forbidden"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "ArtifactsError";
  }
}

export function artifactsMcpUrl(): string {
  return (process.env.ARTIFACTS_MCP_URL || "").trim().replace(/\/+$/, "");
}

function artifactsToken(): string {
  return (process.env.ARTIFACTS_MCP_TOKEN || "").trim();
}

/**
 * The workspace these tokens act as, for display only.
 *
 * The engine binds a token to one org server-side; this build has no Clerk and
 * cannot derive it, so it is shown only when set explicitly. Never sent — it
 * exists so a manager can see which workspace the worker publishes into before
 * switching it on.
 */
export function artifactsOrgLabel(): string | null {
  return (process.env.ARTIFACTS_ORG_ID || "").trim() || null;
}

/**
 * True when the server holds both halves of the credential. Without them the
 * integration is unavailable rather than merely disabled, and fails closed:
 * nothing is ever sent to Artifacts.
 */
export function isArtifactsConfigured(): boolean {
  return Boolean(artifactsMcpUrl() && artifactsToken());
}

interface JsonRpcResponse {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: unknown };
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

  if (!raw) throw new ArtifactsError("Artifacts returned an empty response", null, "protocol");
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new ArtifactsError(
      `Artifacts returned an unreadable response: ${raw.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

let nextId = 1;

/** The envelope revision 2026-07-28 requires on every request's `params`. */
function metaEnvelope() {
  return {
    "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

async function artifactsRpc(
  method: string,
  params: Record<string, unknown>,
  options: { toolName?: string; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  if (!isArtifactsConfigured()) {
    throw new ArtifactsError(
      "Artifacts is not configured on this server (ARTIFACTS_MCP_URL / ARTIFACTS_MCP_TOKEN)",
      null,
      "unconfigured",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // The server rejects the request if these headers disagree with the body, so
  // they are derived from the same values rather than passed in separately.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${artifactsToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    "mcp-method": method,
  };
  if (options.toolName) headers["mcp-name"] = options.toolName;

  let res: Response;
  try {
    res = await fetch(artifactsMcpUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method,
        params: { _meta: metaEnvelope(), ...params },
      }),
      signal: controller.signal,
      // Next patches global fetch and will cache route-handler requests without
      // this. Cast: `cache` is not on the DOM RequestInit this project compiles against.
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ArtifactsError(
      aborted ? `Artifacts did not respond within ${timeoutMs}ms` : "Could not reach Artifacts",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) {
      // The engine distinguishes "no token" from "revoked token"; so should we,
      // because only one of them is fixed by pasting a new value into env.
      const revoked = /invalid_token|invalid or revoked/i.test(detail);
      throw new ArtifactsError(
        revoked
          ? "Artifacts rejected the token — it is invalid or has been revoked. Issue a new one in the Artifact Engine under Settings > Agent access."
          : "Artifacts needs a workspace token (ARTIFACTS_MCP_TOKEN)",
        401,
        revoked ? "revoked" : "auth",
      );
    }
    if (res.status === 403) {
      throw new ArtifactsError(
        "Artifacts refused the request — this token may not hold the required permission",
        403,
        "forbidden",
      );
    }
    throw new ArtifactsError(`Artifacts request failed: ${res.status} ${detail}`, res.status, "http");
  }

  const parsed = parseRpcBody(
    res.headers.get("content-type") || "",
    await res.text().catch(() => ""),
  );
  if (parsed.error) {
    throw new ArtifactsError(
      `Artifacts error: ${parsed.error.message ?? "unknown"}`,
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

/** Artifacts returns its payloads as a JSON string inside the text block. */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<Record<string, unknown>> {
  const result = await artifactsRpc("tools/call", { name, arguments: args }, {
    toolName: name,
    timeoutMs,
  });
  const text = toolText(result);
  if (result.isError) {
    throw new ArtifactsError(
      `Artifacts tool "${name}" failed: ${text.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
  if (!text.trim().startsWith("{")) return { text };
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

/**
 * The live tool surface.
 *
 * Discovered rather than hardcoded: this is both the cheapest proof the token
 * works and the list any future agent-tool wiring should be built from.
 */
export async function listTools(timeoutMs?: number): Promise<ArtifactsTool[]> {
  const result = await artifactsRpc("tools/list", {}, { timeoutMs });
  const tools = Array.isArray(result.tools) ? (result.tools as Array<Record<string, unknown>>) : [];
  return tools.map((tool) => {
    const name = String(tool.name ?? "");
    return {
      name,
      description: String(tool.description ?? "").trim(),
      writes: (WRITING_TOOLS as readonly string[]).includes(name),
    };
  });
}

/** The workspace's brand kits. Only `usable` (confirmed) kits may be applied. */
export async function listBrandKits(timeoutMs?: number): Promise<ArtifactsBrandKit[]> {
  const data = await callTool("list_brand_kits", {}, timeoutMs);
  const kits = Array.isArray(data.brand_kits)
    ? (data.brand_kits as Array<Record<string, unknown>>)
    : [];
  return kits.map((kit) => ({
    id: String(kit.id ?? ""),
    name: String(kit.name ?? "Untitled kit"),
    isDefault: Boolean(kit.is_default),
    usable: kit.usable !== false,
  }));
}

export interface ArtifactsConnectionCheck {
  ok: boolean;
  toolCount: number;
  tools: ArtifactsTool[];
  brandKits: ArtifactsBrandKit[];
  error: string | null;
  errorKind: ArtifactsError["kind"] | null;
}

/**
 * "Test connection" for the settings screen: the tool surface plus the brand
 * kits, which together prove the token is valid *and* that its permissions
 * reach real workspace data. Never throws; the screen renders the failure.
 */
export async function checkArtifactsConnection(
  timeoutMs?: number,
): Promise<ArtifactsConnectionCheck> {
  try {
    const tools = await listTools(timeoutMs);
    // Brand kits sit behind their own `brand:read` scope, so a token can list
    // tools and still fail here. That is information, not a failed test.
    const brandKits = await listBrandKits(timeoutMs).catch(() => [] as ArtifactsBrandKit[]);
    return {
      ok: true,
      toolCount: tools.length,
      tools,
      brandKits,
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof ArtifactsError;
    return {
      ok: false,
      toolCount: 0,
      tools: [],
      brandKits: [],
      error: known ? error.message : "Artifacts connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
