import type { KnowledgeMatch } from "@/lib/knowledge";

/**
 * Parchment — internal AIX Core agent integration.
 *
 * Implements the server-to-server path from Parchment's
 * `docs/agent-integration-internal.md`: three headers instead of a bearer key,
 * no per-workspace key to mint, and lazy provisioning of the org's default
 * workspace on first touch.
 *
 *   X-Internal-Key   shared secret across AIX Core agent products
 *   X-Clerk-Org-Id   the org's id, as Parchment knows it
 *   X-Agent-Id       attribution label for this worker (not a permission)
 *   X-Workspace-Id   optional; omit to use the org's default workspace
 *
 * Access ceiling on this path is the `agent` role: read + staged proposals.
 * It cannot ingest, edit or delete — `/ingest` returns 403 here by design.
 *
 * The internal key is a server-only secret: never returned from an API route,
 * never logged, never shipped to a browser.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export interface ParchmentWorkspace {
  id: string;
  name: string;
  visibility: string;
}

export interface ParchmentResolveResult {
  orgId: string;
  defaultWorkspaceId: string | null;
  workspaces: ParchmentWorkspace[];
}

export interface ParchmentSection {
  sectionId: string;
  title: string;
  content: string;
  hierarchyPath: string | null;
  sourceFile: string | null;
  score: number;
  similarity: number | null;
  businessFunction: string | null;
  businessObjective: string | null;
}

export interface ParchmentQueryResult {
  query: string;
  count: number;
  confidence: number | null;
  results: ParchmentSection[];
}

/** Distinguishes "Parchment said no" from "Parchment was unreachable". */
export class ParchmentError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: "unconfigured" | "auth" | "forbidden" | "http" | "network" | "timeout",
  ) {
    super(message);
    this.name = "ParchmentError";
  }
}

export function parchmentApiUrl(): string {
  return (process.env.PARCHMENT_API_URL || "").trim().replace(/\/+$/, "");
}

function internalKey(): string {
  return (process.env.PARCHMENT_INTERNAL_AGENT_KEY || "").trim();
}

/** The label this worker files against `caller_agent_label` in Parchment. */
export function parchmentAgentId(fallbackSlug: string): string {
  return (process.env.PARCHMENT_AGENT_ID || "").trim() || fallbackSlug || "worker";
}

/**
 * True when the server holds both halves of the credential. Without them the
 * integration is unavailable rather than merely disabled, and fails closed:
 * nothing is ever sent to Parchment.
 */
export function isParchmentConfigured(): boolean {
  return Boolean(parchmentApiUrl() && internalKey());
}

/**
 * The org id Parchment knows this organization by.
 *
 * Parchment keys orgs on `clerk_org_id`. This Foundation build has no Clerk
 * (see lib/identity.ts), so the id is configuration: an explicit per-worker
 * override, else PARCHMENT_ORG_ID, else the local org id. Getting this wrong
 * points the worker at another org's workspace, so it is never guessed beyond
 * this fallback chain.
 */
export function parchmentOrgId(localOrgId: string, override?: string | null): string {
  const explicit = (override || "").trim();
  if (explicit) return explicit;
  const fromEnv = (process.env.PARCHMENT_ORG_ID || "").trim();
  if (fromEnv) return fromEnv;
  return localOrgId;
}

function buildHeaders(orgId: string, agentId: string, workspaceId?: string | null) {
  const base: Record<string, string> = {
    "X-Internal-Key": internalKey(),
    "X-Clerk-Org-Id": orgId,
    "X-Agent-Id": agentId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (workspaceId) base["X-Workspace-Id"] = workspaceId;
  return base;
}

/** Pulls FastAPI's `detail` out of an error body, falling back to raw text. */
async function upstreamDetail(res: Response): Promise<string> {
  const raw = (await res.text().catch(() => "")).slice(0, 300).trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Not JSON — use the raw text.
  }
  return raw;
}

function withDetail(message: string, detail: string): string {
  return detail ? `${message}: ${detail}` : message;
}

async function parchmentFetch<T>(
  path: string,
  init: RequestInit & {
    orgId: string;
    agentId: string;
    workspaceId?: string | null;
    timeoutMs?: number;
  },
): Promise<T> {
  if (!isParchmentConfigured()) {
    throw new ParchmentError(
      "Parchment is not configured on this server (PARCHMENT_API_URL / PARCHMENT_INTERNAL_AGENT_KEY)",
      null,
      "unconfigured",
    );
  }

  const { orgId, agentId, workspaceId, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${parchmentApiUrl()}${path}`, {
      ...rest,
      headers: { ...buildHeaders(orgId, agentId, workspaceId), ...(rest.headers || {}) },
      signal: controller.signal,
      // Next patches global fetch and will cache route-handler requests without
      // this. Cast: `cache` is not on the DOM RequestInit this project compiles against.
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ParchmentError(
      aborted ? `Parchment did not respond within ${timeoutMs}ms` : "Could not reach Parchment",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await upstreamDetail(res);
    // Observed on staging: /query answers 401 for a bad key but
    // /internal/.../resolve answers 403 "Invalid internal key" — which the doc's
    // error table assigns to "path disabled". Both therefore have to read as a
    // credential problem, and Parchment's own detail is quoted so the real cause
    // is visible rather than inferred from the status alone.
    if (res.status === 401) {
      throw new ParchmentError(
        withDetail(
          "Parchment rejected the credential (bad internal key, missing org/agent header, or workspace not in this org)",
          detail,
        ),
        401,
        "auth",
      );
    }
    if (res.status === 403) {
      throw new ParchmentError(
        withDetail(
          "Parchment refused the request (invalid internal key, internal path disabled, or role above agent required)",
          detail,
        ),
        403,
        "forbidden",
      );
    }
    throw new ParchmentError(
      withDetail(`Parchment request failed with ${res.status}`, detail),
      res.status,
      "http",
    );
  }

  return (await res.json()) as T;
}

/**
 * Discovery. Optional per the doc — a content call provisions identically —
 * but it is what the Integrations screen lists workspaces from.
 */
export async function resolveWorkspaces(
  orgId: string,
  agentId: string,
): Promise<ParchmentResolveResult> {
  const data = await parchmentFetch<{
    org_id?: string;
    default_workspace_id?: string;
    workspaces?: Array<{ id?: string; name?: string; visibility?: string }>;
  }>(`/internal/orgs/${encodeURIComponent(orgId)}/workspaces/resolve`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
    orgId,
    agentId,
  });

  return {
    orgId: String(data.org_id ?? orgId),
    defaultWorkspaceId: data.default_workspace_id ?? null,
    workspaces: (data.workspaces ?? []).map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? "Untitled"),
      visibility: String(w.visibility ?? "org"),
    })),
  };
}

/** Search. `limit` is clamped to Parchment's documented 1–50 range. */
export async function queryParchment(options: {
  orgId: string;
  agentId: string;
  workspaceId?: string | null;
  query: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<ParchmentQueryResult> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 5));
  const data = await parchmentFetch<{
    query?: string;
    count?: number;
    confidence?: number;
    results?: Array<Record<string, unknown>>;
  }>("/query", {
    method: "POST",
    body: JSON.stringify({ query: options.query, limit }),
    orgId: options.orgId,
    agentId: options.agentId,
    workspaceId: options.workspaceId,
    timeoutMs: options.timeoutMs,
  });

  return {
    query: String(data.query ?? options.query),
    count: Number(data.count ?? data.results?.length ?? 0),
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    results: (data.results ?? []).map((row) => ({
      sectionId: String(row.section_id ?? ""),
      title: String(row.title ?? "Untitled section"),
      content: String(row.content ?? ""),
      hierarchyPath: row.hierarchy_path ? String(row.hierarchy_path) : null,
      sourceFile: row.source_file ? String(row.source_file) : null,
      score: Number(row.score ?? 0),
      similarity: typeof row.similarity === "number" ? row.similarity : null,
      businessFunction: row.business_function ? String(row.business_function) : null,
      businessObjective: row.business_objective ? String(row.business_objective) : null,
    })),
  };
}

/**
 * Shapes a Parchment section like a local knowledge chunk so both sources can
 * be handed to the agent as one list. `documentId` is prefixed so a Parchment
 * section can never be mistaken for a local `knowledge_documents` row id.
 */
export function toKnowledgeMatches(result: ParchmentQueryResult): KnowledgeMatch[] {
  return result.results.map((section) => ({
    documentId: `parchment:${section.sectionId}`,
    title: section.title,
    heading: section.hierarchyPath,
    content: section.content,
    rank: section.score,
  }));
}
