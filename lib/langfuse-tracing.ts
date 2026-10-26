import { createHash } from "node:crypto";
import { addTraceProcessor, setTraceProcessors, setTracingDisabled } from "@openai/agents";
import type { Span, SpanData, Trace, TracingProcessor } from "@openai/agents";
import { redactTicketText } from "@/lib/ticket-redaction";

/**
 * Sends each agent run to Langfuse so one chat can be read back as a whole: a trace per customer turn, grouped into a
 * Langfuse session by the conversation id, with the model calls, tool calls and reply inside it.
 *
 * Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set. Everything that leaves the server is masked first
 * (emails, phone numbers, links, long numbers, secrets, titled and greeted names); the ids that group a chat are not.
 * OpenAI's own trace export keeps running unless OPENAI_AGENTS_DISABLE_TRACING=1, in which case only Langfuse gets the run.
 */

const MAX_TEXT = 20_000;
const MAX_DEPTH = 8;

export function maskForTrace(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactTicketText(value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value).text;
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) return typeof value === "object" ? "[too deep]" : value;
  if (Array.isArray(value)) return value.map((item) => maskForTrace(item, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, maskForTrace(item, depth + 1)]));
}

/** Function-call input and output arrive as JSON text; parse so Langfuse can show them as objects, masked either way. */
function asMasked(text: unknown): unknown {
  if (typeof text !== "string") return maskForTrace(text);
  try {
    return maskForTrace(JSON.parse(text));
  } catch {
    return maskForTrace(text);
  }
}

function lastText(items: unknown, role?: string): string | undefined {
  if (typeof items === "string") return items;
  if (!Array.isArray(items)) return undefined;
  for (const item of [...items].reverse()) {
    const entry = item as { role?: string; content?: unknown };
    if (role && entry.role !== role) continue;
    if (typeof entry.content === "string") return entry.content;
    if (Array.isArray(entry.content)) {
      const text = entry.content.map((part) => (part as { text?: string }).text ?? "").join("");
      if (text) return text;
    }
  }
  return undefined;
}

function replyText(response: unknown): string | undefined {
  const output = (response as { output?: unknown } | undefined)?.output;
  if (!Array.isArray(output)) return undefined;
  const parts: string[] = [];
  for (const item of output as { type?: string; content?: { text?: string }[] }[]) {
    if (item.type === "message" && Array.isArray(item.content)) for (const part of item.content) if (part.text) parts.push(part.text);
  }
  return parts.join("") || undefined;
}

type Collected = { trace: Trace; spans: Span<SpanData>[] };

type Attribute = { key: string; value: { stringValue: string } | { intValue: string } };
export type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 1;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Attribute[];
  status?: { code: 2; message: string };
};

const hash = (text: string, length: number) => createHash("sha256").update(text).digest("hex").slice(0, length);
/** The SDK's ids look like "trace_<32 hex>"; OpenTelemetry wants plain hex of fixed length. */
const traceHex = (id: string) => (/^trace_[0-9a-f]{32}$/i.test(id) ? id.slice(6).toLowerCase() : hash(id, 32));
const spanHex = (id: string) => hash(`span:${id}`, 16);
const nanos = (iso: string | null | undefined, fallback: number) => String(BigInt(Number.isFinite(Date.parse(iso ?? "")) ? Date.parse(iso as string) : fallback) * 1_000_000n);
const text = (key: string, value: unknown): Attribute[] => (value === undefined || value === null ? [] : [{ key, value: { stringValue: typeof value === "string" ? value : JSON.stringify(value) } }]);

/** One trace as OpenTelemetry spans: a root span for the turn, and everything the run did beneath it. */
export function buildSpans(trace: Trace, spans: Span<SpanData>[], environment: string | undefined): OtlpSpan[] {
  const now = Date.now();
  const traceId = traceHex(trace.traceId);
  const rootId = spanHex(`root:${trace.traceId}`);
  let input: string | undefined;
  let output: string | undefined;
  const out: OtlpSpan[] = [];
  // Every observation carries the session and environment, so Langfuse can filter them, not just the root.
  const shared = [...text("langfuse.session.id", trace.groupId), ...text("langfuse.environment", environment)];

  for (const span of spans) {
    const data = span.spanData as Record<string, any>;
    const parent = span.parentId ? spanHex(span.parentId) : rootId;
    let name: string | null = null;
    let attributes: Attribute[] = [];
    if (data.type === "response" || data.type === "generation") {
      const response = data._response as Record<string, any> | undefined;
      const usage = (response?.usage ?? data.usage) as { input_tokens?: number; output_tokens?: number } | undefined;
      const generationInput = data.type === "response" ? data._input : data.input;
      const generationOutput = data.type === "response" ? (replyText(response) ?? response?.output) : data.output;
      input ??= lastText(generationInput, "user");
      output = replyText(response) ?? lastText(generationOutput) ?? output;
      name = "model call";
      attributes = [
        ...text("langfuse.observation.type", "generation"),
        ...text("langfuse.observation.model.name", response?.model ?? data.model),
        ...text("langfuse.observation.input", maskForTrace(generationInput)),
        ...text("langfuse.observation.output", maskForTrace(generationOutput)),
        ...(usage ? text("langfuse.observation.usage_details", { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }) : []),
      ];
    } else if (data.type === "function") {
      name = `tool: ${data.name}`;
      attributes = [...text("langfuse.observation.type", "tool"), ...text("langfuse.observation.input", asMasked(data.input)), ...text("langfuse.observation.output", asMasked(data.output))];
    } else if (data.type === "handoff") {
      name = `handoff: ${data.from_agent} → ${data.to_agent}`;
      attributes = text("langfuse.observation.type", "span");
    } else if (data.type === "guardrail") {
      name = `guardrail: ${data.name}`;
      attributes = [...text("langfuse.observation.type", "guardrail"), ...text("langfuse.observation.output", { triggered: data.triggered })];
    } else if (data.type === "agent") {
      name = `agent: ${data.name}`;
      attributes = [...text("langfuse.observation.type", "agent"), ...text("langfuse.observation.metadata.tools", data.tools), ...text("langfuse.observation.metadata.handoffs", data.handoffs)];
    } else if (data.type === "custom") {
      name = String(data.name ?? "custom");
      attributes = [...text("langfuse.observation.type", "span"), ...text("langfuse.observation.metadata", maskForTrace(data.data))];
    }
    if (name === null) continue;
    out.push({
      traceId,
      spanId: spanHex(span.spanId),
      parentSpanId: parent,
      name,
      kind: 1,
      startTimeUnixNano: nanos(span.startedAt, now),
      endTimeUnixNano: nanos(span.endedAt, now),
      attributes: [...attributes, ...shared, ...(span.error ? text("langfuse.observation.level", "ERROR") : [])],
      ...(span.error ? { status: { code: 2 as const, message: String(maskForTrace(span.error.message)) } } : {}),
    });
  }

  const starts = out.map((s) => BigInt(s.startTimeUnixNano));
  const ends = out.map((s) => BigInt(s.endTimeUnixNano));
  const metadata = Object.entries(trace.metadata ?? {}).flatMap(([key, value]) => text(`langfuse.trace.metadata.${key}`, value));
  out.unshift({
    traceId,
    spanId: rootId,
    name: trace.name,
    kind: 1,
    startTimeUnixNano: String(starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : BigInt(now) * 1_000_000n),
    endTimeUnixNano: String(ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : BigInt(now) * 1_000_000n),
    attributes: [
      ...text("langfuse.trace.name", trace.name),
      ...shared,
      ...text("langfuse.trace.input", input ? maskForTrace(input) : undefined),
      ...text("langfuse.trace.output", output ? maskForTrace(output) : undefined),
      ...text("langfuse.observation.input", input ? maskForTrace(input) : undefined),
      ...text("langfuse.observation.output", output ? maskForTrace(output) : undefined),
      ...metadata,
    ],
  });
  return out;
}

export class LangfuseProcessor implements TracingProcessor {
  private open = new Map<string, Collected>();
  private inFlight = new Set<Promise<void>>();

  constructor(
    private readonly config: { baseUrl: string; publicKey: string; secretKey: string; environment?: string },
    private readonly post: typeof fetch = fetch,
  ) {}

  async onTraceStart(trace: Trace) {
    this.open.set(trace.traceId, { trace, spans: [] });
  }
  async onSpanStart() {}
  async onSpanEnd(span: Span<SpanData>) {
    this.open.get(span.traceId)?.spans.push(span);
  }
  async onTraceEnd(trace: Trace) {
    const collected = this.open.get(trace.traceId);
    this.open.delete(trace.traceId);
    if (!collected) return;
    const job = this.send(buildSpans(trace, collected.spans, this.config.environment)).finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }
  async forceFlush() {
    await Promise.allSettled([...this.inFlight]);
  }
  async shutdown() {
    await this.forceFlush();
  }

  /** Never throws: a tracing problem must not break a customer's reply. */
  private async send(spans: OtlpSpan[]): Promise<void> {
    const auth = Buffer.from(`${this.config.publicKey}:${this.config.secretKey}`).toString("base64");
    try {
      const response = await this.post(`${this.config.baseUrl.replace(/\/+$/, "")}/api/public/otel/v1/traces`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${auth}`, "x-langfuse-ingestion-version": "4" },
        body: JSON.stringify({
          resourceSpans: [{ resource: { attributes: text("service.name", "agent-mike") }, scopeSpans: [{ scope: { name: "agent-mike" }, spans }] }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) console.warn(`[langfuse] export refused: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`);
    } catch (error) {
      console.warn("[langfuse] export failed:", error instanceof Error ? error.message : error);
    }
  }
}

let started = false;

/** Idempotent. Called before each run; does nothing without keys. */
export function initLangfuseTracing(env: NodeJS.ProcessEnv = process.env): boolean {
  if (started) return true;
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return false;
  started = true;
  const processor = new LangfuseProcessor({
    baseUrl: env.LANGFUSE_BASE_URL || env.LANGFUSE_HOST || "https://cloud.langfuse.com",
    publicKey,
    secretKey,
    environment: env.RAILWAY_ENVIRONMENT_NAME || env.NODE_ENV,
  });
  // The SDK's own switch turns tracing off for every processor. Langfuse needs tracing on, so turn it back on and
  // drop OpenAI's exporter instead when that switch was set.
  const openAiOff = env.OPENAI_AGENTS_DISABLE_TRACING === "1" || env.OPENAI_AGENTS_DISABLE_TRACING === "true";
  setTracingDisabled(false);
  if (openAiOff) setTraceProcessors([processor]);
  else addTraceProcessor(processor);
  return true;
}
