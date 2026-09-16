/**
 * AIX Skills — the organization's published skill repository, over MCP.
 *
 * A third source of skills, alongside the SKILL.md catalog in this repo and
 * the custom skills an org writes in Settings. The difference is how a skill
 * is found: catalog and custom skills are enumerated and toggled one by one,
 * while the repository is *searched* — the agent describes its task and the
 * server ranks skills by how well their descriptions match.
 *
 * That is the repository's own design ("no slugs to remember"), and it is why
 * this integration is a single switch rather than a list of toggles: the point
 * is that the worker can reach skills nobody thought to enable in advance.
 *
 * Auth is one org-scoped bearer key against one endpoint, the same shape as
 * Scribe and Agent Wiki:
 *
 *   Authorization: Bearer <AIX_SKILLS_API_KEY>
 *
 * Read-only by construction. The key can search and load published skills and
 * nothing else, so unlike Agent Wiki there is no write scope to withhold.
 *
 * Every search and load is logged upstream against the key that made it, which
 * is worth knowing before switching this on: the repository owner can see what
 * this worker looked for, including the searches that came back empty.
 */

import { resolveCredentials, type ResolvedCredentials } from "@/lib/provider-credentials";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MCP_URL = "https://api-staging-da41.up.railway.app/mcp";

/** Repository ids are namespaced so they can never collide with a catalog id
 *  or a custom skill's UUID once they are all in one list. */
export const REPO_ID_PREFIX = "repo:";

export function isRepositorySkillId(id: string): boolean {
  return id.startsWith(REPO_ID_PREFIX);
}

export function toRepositorySkillId(slug: string): string {
  return `${REPO_ID_PREFIX}${slug}`;
}

export function repositorySlugFrom(id: string): string {
  return id.startsWith(REPO_ID_PREFIX) ? id.slice(REPO_ID_PREFIX.length) : id;
}

export interface RepositorySkill {
  slug: string;
  name: string;
  description: string;
  category: string | null;
  /** Only present once the skill is actually loaded. */
  body: string;
}

export interface RepositoryCategory {
  name: string;
  count: number | null;
}

/** Distinguishes "the repository said no" from "it was unreachable". */
export class SkillsRepositoryError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "forbidden"
      | "not_found"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "SkillsRepositoryError";
  }
}

export type SkillsRepositoryCredentials = {
  apiUrl: string;
  apiKey: string;
};

export const SKILLS_PROVIDER = "aix_skills";
/** What the settings screen reports as set or missing. */
export const SKILLS_REQUIRED_FIELDS = ["apiKey"] as const;

/** The fleet-wide key, shared by every agent unless one brings its own. */
export function envSkillsCredentials(): SkillsRepositoryCredentials {
  return {
    apiUrl: (process.env.AIX_SKILLS_MCP_URL || DEFAULT_MCP_URL).trim().replace(/\/+$/, ""),
    apiKey: (process.env.AIX_SKILLS_API_KEY || "").trim(),
  };
}

export function isCompleteSkillsCredentials(
  values: Partial<SkillsRepositoryCredentials>,
): boolean {
  return Boolean((values.apiUrl || "").trim() && (values.apiKey || "").trim());
}

/** Normalizes whatever was stored, so a missing URL still has the default. */
export function normalizeSkillsCredentials(
  values: Partial<SkillsRepositoryCredentials>,
): SkillsRepositoryCredentials {
  return {
    apiUrl: (values.apiUrl || DEFAULT_MCP_URL).trim().replace(/\/+$/, ""),
    apiKey: (values.apiKey || "").trim(),
  };
}

/**
 * This agent's own key if it has one, otherwise the fleet's. Null when neither
 * exists — the caller reports unavailable rather than calling out with half a
 * credential.
 */
export async function resolveSkillsCredentials(
  orgId: string,
): Promise<ResolvedCredentials<SkillsRepositoryCredentials> | null> {
  const resolved = await resolveCredentials<SkillsRepositoryCredentials>(
    orgId,
    SKILLS_PROVIDER,
    envSkillsCredentials,
    isCompleteSkillsCredentials,
  );
  return resolved ? { ...resolved, values: normalizeSkillsCredentials(resolved.values) } : null;
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

  if (!raw) {
    throw new SkillsRepositoryError("The skill repository returned an empty response", null, "protocol");
  }
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new SkillsRepositoryError(
      `The skill repository returned an unreadable response: ${raw.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

let nextId = 1;

async function rpc(
  credentials: SkillsRepositoryCredentials,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  if (!isCompleteSkillsCredentials(credentials)) {
    throw new SkillsRepositoryError(
      "No skill repository key is configured for this agent",
      null,
      "unconfigured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(credentials.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
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
    throw new SkillsRepositoryError(
      aborted
        ? `The skill repository did not respond within ${timeoutMs}ms`
        : "Could not reach the skill repository",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) {
      throw new SkillsRepositoryError(
        "The skill repository rejected this agent's key",
        401,
        "auth",
      );
    }
    if (res.status === 403) {
      throw new SkillsRepositoryError(
        "The skill repository refused the request — this key may not reach that organization",
        403,
        "forbidden",
      );
    }
    throw new SkillsRepositoryError(
      `Skill repository request failed: ${res.status} ${detail}`,
      res.status,
      "http",
    );
  }

  const parsed = parseRpcBody(
    res.headers.get("content-type") || "",
    await res.text().catch(() => ""),
  );
  if (parsed.error) {
    throw new SkillsRepositoryError(
      `Skill repository error: ${parsed.error.message ?? "unknown"}`,
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

/**
 * Calls a tool and returns both the parsed payload and the raw text.
 *
 * `get_skill` answers with the SKILL.md itself — markdown, not JSON — while
 * `search_skills` answers with a JSON envelope. Keeping both means neither
 * caller has to guess which it got.
 */
async function callTool(
  credentials: SkillsRepositoryCredentials,
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<{ data: Record<string, unknown>; text: string }> {
  const result = await rpc(credentials, "tools/call", { name, arguments: args }, timeoutMs);
  const text = toolText(result);
  if (result.isError) {
    const missing = /not found|no such skill|unknown skill/i.test(text);
    throw new SkillsRepositoryError(
      missing
        ? `The skill repository has no skill matching that request`
        : `Skill repository tool "${name}" failed: ${text.slice(0, 200)}`,
      null,
      missing ? "not_found" : "protocol",
    );
  }
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return { data: {}, text };
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return { data: Array.isArray(parsed) ? { results: parsed } : (parsed as Record<string, unknown>), text };
  } catch {
    return { data: {}, text };
  }
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function optional(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

/** Rows come back under whichever key the tool happens to use. */
function rowsFrom(data: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return [];
}

/** What the agent needs at chat time, resolved from the integration slice. */
export interface AgentSkillsRuntime {
  category: string | null;
  maxResults: number;
}

export interface RepositoryTool {
  name: string;
  description: string;
}

/** The live tool surface — the cheapest proof the key works. */
export async function listRepositoryTools(
  credentials: SkillsRepositoryCredentials,
  timeoutMs?: number,
): Promise<RepositoryTool[]> {
  const result = await rpc(credentials, "tools/list", {}, timeoutMs);
  const tools = Array.isArray(result.tools) ? (result.tools as Array<Record<string, unknown>>) : [];
  return tools.map((tool) => ({
    name: str(tool.name),
    description: str(tool.description).trim(),
  }));
}

/**
 * Search by task description, which is the repository's whole interface.
 *
 * Bodies are deliberately not returned here: a search result is a candidate,
 * and pulling every candidate's full SKILL.md into context would undo the
 * progressive disclosure the local catalog already gets right.
 */
export async function searchSkills(options: {
  credentials: SkillsRepositoryCredentials;
  query: string;
  category?: string | null;
  limit?: number;
  timeoutMs?: number;
}): Promise<RepositorySkill[]> {
  const limit = Math.min(20, Math.max(1, options.limit ?? 5));
  const { data } = await callTool(
    options.credentials,
    "search_skills",
    {
      query: options.query,
      ...(options.category ? { category: options.category } : {}),
      limit,
    },
    options.timeoutMs,
  );

  return rowsFrom(data, ["results", "skills", "items"])
    .map((row) => ({
      slug: str(row.slug ?? row.id),
      name: str(row.name ?? row.title) || str(row.slug),
      description: str(row.description),
      category: optional(row.category),
      body: "",
    }))
    .filter((skill) => skill.slug)
    .slice(0, limit);
}

/** The full SKILL.md, for a skill the agent has decided to follow. */
export async function getRepositorySkill(
  credentials: SkillsRepositoryCredentials,
  slug: string,
  timeoutMs?: number,
): Promise<RepositorySkill | null> {
  try {
    const { data, text } = await callTool(credentials, "get_skill", { slug }, timeoutMs);
    // `get_skill` may answer with the markdown itself or a JSON envelope
    // around it; both are normal, so accept either rather than insisting.
    const body = str(data.body ?? data.content ?? data.markdown) || text;
    if (!body.trim()) return null;
    return {
      slug,
      name: str(data.name ?? data.title) || slug,
      description: str(data.description),
      category: optional(data.category),
      body,
    };
  } catch (error) {
    if (error instanceof SkillsRepositoryError && error.kind === "not_found") return null;
    throw error;
  }
}

/** What the repository holds, for the settings screen to show. */
export async function listCategories(
  credentials: SkillsRepositoryCredentials,
  timeoutMs?: number,
): Promise<RepositoryCategory[]> {
  const { data } = await callTool(credentials, "list_categories", {}, timeoutMs);
  return rowsFrom(data, ["categories", "results", "items"])
    .map((row) => ({
      name: str(row.name ?? row.category ?? row),
      count: typeof row.count === "number" ? row.count : null,
    }))
    .filter((category) => category.name);
}

export interface SkillsRepositoryCheck {
  ok: boolean;
  toolCount: number;
  tools: RepositoryTool[];
  categories: RepositoryCategory[];
  error: string | null;
  errorKind: SkillsRepositoryError["kind"] | null;
}

/**
 * "Test connection" for the settings screen.
 *
 * Tools first, then categories: the tool list proves the key is accepted, and
 * the categories prove it reaches this organization's published skills rather
 * than an empty repository. Categories failing on their own is information,
 * not a failed test. Never throws; the screen renders the failure.
 */
export async function checkSkillsRepository(
  credentials: SkillsRepositoryCredentials,
  timeoutMs?: number,
): Promise<SkillsRepositoryCheck> {
  try {
    const tools = await listRepositoryTools(credentials, timeoutMs);
    const categories = await listCategories(credentials, timeoutMs).catch(
      () => [] as RepositoryCategory[],
    );
    return {
      ok: true,
      toolCount: tools.length,
      tools,
      categories,
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof SkillsRepositoryError;
    return {
      ok: false,
      toolCount: 0,
      tools: [],
      categories: [],
      error: known ? error.message : "Skill repository connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
