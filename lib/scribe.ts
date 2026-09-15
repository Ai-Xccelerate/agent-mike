import type { KnowledgeMatch } from "@/lib/knowledge";

/**
 * Scribe — meeting notetaker integration.
 *
 * A third auth model again, and the simplest of the three: a single org-scoped
 * bearer token against one MCP endpoint. No internal-key headers (Parchment,
 * AgentDB), no Clerk JWT, no workspace resolution.
 *
 *   Authorization: Bearer sk_scribe_org_…
 *
 * The server is stateless over MCP: `tools/call` works without an `initialize`
 * handshake or a session id, so each call is one self-contained POST. That is
 * verified behaviour of the live service, not an assumption — which is why
 * this client is much smaller than lib/agentdb.ts.
 *
 * Every tool Scribe exposes is read-only (list/get meetings, transcripts,
 * chat, insights, action items, and corpus-wide meeting intelligence). There
 * is nothing to write, so unlike AgentDB there is no scope to clamp down —
 * the risk here is disclosure, not mutation, and that is handled by the
 * integration defaulting to off.
 *
 * The token is a server-only secret: never returned from an API route, never
 * logged, never shipped to a browser.
 */

const DEFAULT_TIMEOUT_MS = 20000;

export interface ScribeCitation {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string | null;
  timestamp: string | null;
  quote: string;
  speakerName: string | null;
}

export interface ScribeAnswer {
  question: string;
  answer: string;
  citations: ScribeCitation[];
  conversationId: string | null;
}

export interface ScribeMeeting {
  id: string;
  title: string;
  startTime: string | null;
  status: string | null;
  hasTranscript: boolean;
}

export interface ScribeMeetingPage {
  items: ScribeMeeting[];
  total: number;
}

/** Distinguishes "Scribe said no" from "Scribe was unreachable". */
export class ScribeError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "forbidden"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "ScribeError";
  }
}

export function scribeMcpUrl(): string {
  return (process.env.SCRIBE_MCP_URL || "").trim().replace(/\/+$/, "");
}

function scribeToken(): string {
  return (process.env.SCRIBE_MCP_TOKEN || "").trim();
}

/**
 * True when the server holds both halves of the credential. Without them the
 * integration is unavailable rather than merely disabled, and fails closed:
 * nothing is ever sent to Scribe.
 */
export function isScribeConfigured(): boolean {
  return Boolean(scribeMcpUrl() && scribeToken());
}

/** How far back meeting evidence may be drawn from, as an ISO date bound. */
export function lookbackDateFrom(lookbackDays: number | null): string | undefined {
  if (!lookbackDays || lookbackDays <= 0) return undefined;
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  return from.toISOString().slice(0, 10);
}

interface JsonRpcResponse {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/** Scribe answers in plain JSON, but accept SSE too — MCP permits either. */
function parseRpcBody(contentType: string, body: string): JsonRpcResponse {
  const raw = contentType.includes("text/event-stream")
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .pop()
    : body.trim();

  if (!raw) throw new ScribeError("Scribe returned an empty response", null, "protocol");
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    throw new ScribeError(
      `Scribe returned an unreadable response: ${raw.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

let nextId = 1;

async function scribeRpc(
  method: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  if (!isScribeConfigured()) {
    throw new ScribeError(
      "Scribe is not configured on this server (SCRIBE_MCP_URL / SCRIBE_MCP_TOKEN)",
      null,
      "unconfigured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(scribeMcpUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scribeToken()}`,
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
    throw new ScribeError(
      aborted ? `Scribe did not respond within ${timeoutMs}ms` : "Could not reach Scribe",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) {
      throw new ScribeError("Scribe rejected the token (SCRIBE_MCP_TOKEN)", 401, "auth");
    }
    if (res.status === 403) {
      throw new ScribeError(
        "Scribe refused the request — this token may not have access to that data",
        403,
        "forbidden",
      );
    }
    throw new ScribeError(`Scribe request failed: ${res.status} ${detail}`, res.status, "http");
  }

  const parsed = parseRpcBody(
    res.headers.get("content-type") || "",
    await res.text().catch(() => ""),
  );
  if (parsed.error) {
    throw new ScribeError(`Scribe error: ${parsed.error.message ?? "unknown"}`, null, "protocol");
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

/** Scribe returns its payloads as a JSON string inside the text block. */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<Record<string, unknown>> {
  const result = await scribeRpc("tools/call", { name, arguments: args }, timeoutMs);
  const text = toolText(result);
  if (result.isError) {
    throw new ScribeError(`Scribe tool "${name}" failed: ${text.slice(0, 200)}`, null, "protocol");
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

/**
 * Corpus-wide question answering — the one Scribe tool worth giving a worker.
 *
 * The per-meeting tools all need a meeting id the worker has no way to know;
 * this one takes a natural-language question over everything indexed and comes
 * back with an answer plus citations, which is exactly the shape retrieval
 * already deals in.
 */
export async function askMeetingIntelligence(options: {
  question: string;
  lookbackDays?: number | null;
  conversationId?: string | null;
  timeoutMs?: number;
}): Promise<ScribeAnswer> {
  const dateFrom = lookbackDateFrom(options.lookbackDays ?? null);
  const data = await callTool(
    "ask_meeting_intelligence",
    {
      question: options.question,
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
    },
    options.timeoutMs,
  );

  const citations = Array.isArray(data.citations) ? (data.citations as Array<Record<string, unknown>>) : [];

  return {
    question: options.question,
    answer: str(data.answer ?? data.text),
    conversationId: optional(data.conversation_id),
    citations: citations.map((c) => ({
      meetingId: str(c.meeting_id),
      meetingTitle: str(c.meeting_title) || "Untitled meeting",
      meetingDate: optional(c.meeting_date),
      timestamp: optional(c.timestamp),
      quote: str(c.quote),
      speakerName: optional(c.speaker_name),
    })),
  };
}

/** Recent meetings — used by the settings screen to prove the token works. */
export async function listMeetings(pageSize = 3, timeoutMs?: number): Promise<ScribeMeetingPage> {
  const data = await callTool(
    "list_meetings",
    { page: 1, page_size: Math.min(20, Math.max(1, pageSize)) },
    timeoutMs,
  );
  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  return {
    total: typeof data.total === "number" ? data.total : items.length,
    items: items.map((m) => ({
      id: str(m.id),
      title: str(m.title) || "Untitled meeting",
      startTime: optional(m.start_time),
      status: optional(m.status),
      hasTranscript: Boolean(m.has_transcript),
    })),
  };
}

/**
 * Shapes a Scribe answer like local knowledge chunks so every source can be
 * handed to the agent as one list.
 *
 * The synthesized answer leads, because that is what actually answers the
 * question; each citation follows as its own chunk so the worker can quote a
 * meeting rather than only Scribe's paraphrase of it. Ids are prefixed so a
 * meeting can never be mistaken for a local `knowledge_documents` row.
 */
export function toKnowledgeMatches(result: ScribeAnswer, limit: number): KnowledgeMatch[] {
  const matches: KnowledgeMatch[] = [];

  if (result.answer.trim()) {
    matches.push({
      documentId: "scribe:answer",
      title: "Meeting intelligence",
      heading: null,
      content: result.answer,
      rank: 1,
    });
  }

  for (const citation of result.citations) {
    if (matches.length >= limit) break;
    if (!citation.quote.trim()) continue;
    const when = [citation.meetingDate, citation.timestamp].filter(Boolean).join(" ");
    matches.push({
      documentId: `scribe:${citation.meetingId}`,
      title: citation.meetingTitle,
      heading: when || null,
      content: citation.speakerName ? `${citation.speakerName}: ${citation.quote}` : citation.quote,
      rank: 0.5,
    });
  }

  return matches.slice(0, limit);
}

export interface ScribeConnectionCheck {
  ok: boolean;
  meetingCount: number;
  recentMeetings: ScribeMeeting[];
  error: string | null;
  errorKind: ScribeError["kind"] | null;
}

/**
 * "Test connection" for the settings screen. `list_meetings` is the cheapest
 * call that proves the token is valid *and* that this org actually has meeting
 * data behind it — a valid token over an empty corpus is worth showing.
 *
 * Never throws; the screen renders the failure.
 */
export async function checkScribeConnection(timeoutMs?: number): Promise<ScribeConnectionCheck> {
  try {
    const page = await listMeetings(3, timeoutMs);
    return {
      ok: true,
      meetingCount: page.total,
      recentMeetings: page.items,
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof ScribeError;
    return {
      ok: false,
      meetingCount: 0,
      recentMeetings: [],
      error: known ? error.message : "Scribe connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
