# Deferred tasks

Work that has been scoped and deliberately postponed. Each entry says what to
build, where, and what has to be true before it ships. Pick one up only when
it is asked for.

## Rate limiting on the public chat endpoint

**Status:** deferred (30 Sep 2026). Not started.

`POST /api/v1/chat` is public by design: the widget calls it with only a site
token. Today the only bound is the 10,000-character message cap
(`MAX_MESSAGE_LENGTH` in `app/api/v1/chat/route.ts`). Nothing limits how many
requests one caller can send, and every request can reach a paid model call.

What to build:

- Limit widget requests per site token and per client IP, and manager requests
  per user. Suggested starting point: a short burst limit plus a per-minute
  limit, tuned once real traffic exists.
- Keep the counters somewhere shared (Postgres or Redis). Railway can run more
  than one replica, so an in-memory counter would not hold.
- Return `429` with a `Retry-After` header, and have the widget show a
  "please wait a moment" message instead of a generic error.
- Also cover `GET /api/v1/worker` when it is called with a site token (the
  widget loads the worker's public identity this way). It does no model call,
  so a looser limit is fine.
- Add tests for: under the limit, over the limit, and two site tokens not
  sharing a bucket.

## Tracing: OpenAI now, self-hosted Langfuse later

**Status:** decided (30 Sep 2026). OpenAI tracing stays as it is for now.
Langfuse is a later task, not a current priority.

Current behaviour: agent runs go through `runTracedAgent`
(`lib/agent-tracing.ts`), and the guardrail classifiers use `run()`
(`lib/guardrails.ts`). With no trace processor configured, the Agents SDK
exports these traces, including model inputs and outputs, to the OpenAI traces
dashboard. The local `tool_calls` table is written but has no read path.

Constraint before real client data: traces contain conversation content. For
a PHI/HIPAA deployment, either OpenAI's terms must cover trace data (BAA or
zero data retention), or trace export must be off before production traffic
starts.

Later task: self-host Langfuse and register it as the Agents SDK trace
processor in place of the OpenAI exporter. Scope it by `organizationId` and
`conversationId` (already in the trace metadata), and include the guardrail
classifier runs.
