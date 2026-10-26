import { describe, expect, it, vi } from "vitest";
import { LangfuseProcessor, buildSpans, maskForTrace } from "@/lib/langfuse-tracing";

const trace = { traceId: "trace_0123456789abcdef0123456789abcdef", name: "Customer chat", groupId: "conv-123", metadata: { organizationId: "org-1", conversationId: "conv-123" } } as never;
const span = (spanId: string, spanData: Record<string, unknown>, parentId: string | null = null, traceId = "trace_0123456789abcdef0123456789abcdef") =>
  ({ spanId, traceId, parentId, startedAt: "2026-10-26T10:00:00.000Z", endedAt: "2026-10-26T10:00:01.000Z", error: null, spanData }) as never;
const attr = (s: { attributes: { key: string; value: { stringValue?: string } }[] }, key: string) => s.attributes.find((a) => a.key === key)?.value.stringValue;

describe("sending runs to Langfuse", () => {
  it("masks personal details but keeps the ids that group a chat", () => {
    expect(maskForTrace({ text: "Email dana@acme.org or call 416-555-0199", nested: ["Hi Dana,"] })).toEqual({ text: "Email [email] or call [phone]", nested: ["Hi [name],"] });
    const [root] = buildSpans(trace, [], "staging");
    expect(root.traceId).toBe("0123456789abcdef0123456789abcdef");
    expect(attr(root as never, "langfuse.session.id")).toBe("conv-123");
    expect(attr(root as never, "langfuse.environment")).toBe("staging");
    expect(attr(root as never, "langfuse.trace.metadata.conversationId")).toBe("conv-123");
  });

  it("turns model calls and tool calls into observations under the turn's root, with the question and the reply", () => {
    const spans = buildSpans(
      trace,
      [
        span("span_a", { type: "function", name: "search_knowledge", input: '{"q":"mail dana@acme.org"}', output: '{"hits":2}' }),
        span("span_b", { type: "response", _input: [{ role: "user", content: "How do I log in?" }], _response: { model: "m", usage: { input_tokens: 10, output_tokens: 4 }, output: [{ type: "message", content: [{ text: "Use the login page." }] }] } }),
      ],
      undefined,
    );
    const [root, tool, model] = spans;
    expect(tool.parentSpanId).toBe(root.spanId);
    expect(tool.name).toBe("tool: search_knowledge");
    expect(attr(tool as never, "langfuse.observation.input")).toBe('{"q":"mail [email]"}');
    expect(attr(model as never, "langfuse.observation.type")).toBe("generation");
    expect(attr(model as never, "langfuse.observation.usage_details")).toBe('{"input":10,"output":4}');
    expect(attr(root as never, "langfuse.trace.input")).toBe("How do I log in?");
    expect(attr(root as never, "langfuse.trace.output")).toBe("Use the login page.");
  });

  it("posts one export per finished trace with the keys, keeps two chats apart, and never throws", async () => {
    const post = vi.fn(async () => new Response("{}", { status: 200 }));
    const processor = new LangfuseProcessor({ baseUrl: "https://lf.example/", publicKey: "pk", secretKey: "sk" }, post as never);
    const otherId = "trace_ffffffffffffffffffffffffffffffff";
    const other = { ...(trace as object), traceId: otherId, groupId: "conv-999" } as never;
    await processor.onTraceStart(trace);
    await processor.onTraceStart(other);
    await processor.onSpanEnd(span("span_a", { type: "agent", name: "Eva" }));
    await processor.onSpanEnd(span("span_z", { type: "agent", name: "Eva" }, null, otherId));
    await processor.onTraceEnd(trace);
    await processor.onTraceEnd(other);
    await processor.forceFlush();
    expect(post).toHaveBeenCalledTimes(2);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lf.example/api/public/otel/v1/traces");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("pk:sk").toString("base64")}`);
    const sent = post.mock.calls.map((call) => JSON.parse(((call as unknown as [string, RequestInit])[1].body as string)).resourceSpans[0].scopeSpans[0].spans);
    expect(sent.map((spans: { attributes: never[] }[]) => attr(spans[0] as never, "langfuse.session.id"))).toEqual(["conv-123", "conv-999"]);
    expect(new Set(sent[0].map((s: { traceId: string }) => s.traceId))).toEqual(new Set(["0123456789abcdef0123456789abcdef"]));

    const failing = new LangfuseProcessor({ baseUrl: "https://lf.example", publicKey: "pk", secretKey: "sk" }, (async () => { throw new Error("down"); }) as never);
    await failing.onTraceStart(trace);
    await expect(failing.onTraceEnd(trace).then(() => failing.forceFlush())).resolves.toBeUndefined();
  });
});

describe("what every observation carries", () => {
  it("has the session and environment on each span, so a chat can be filtered to its tool and model calls", () => {
    const spans = buildSpans(trace, [span("span_a", { type: "function", name: "t", input: "{}", output: "{}" })], "prod");
    for (const s of spans) {
      expect(attr(s as never, "langfuse.session.id")).toBe("conv-123");
      expect(attr(s as never, "langfuse.environment")).toBe("prod");
    }
  });
});
