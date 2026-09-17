# AI Worker — Agent Architecture Review & Remediation Plan

Prepared 2026-09-17. Scope: `AI-worker-backend-assistant` (worktree on
`feature/assistant-tiers-234`, the branch with the Tier 1–4 admin Assistant
work — the most current agent implementation in this repo). Assessed against
the OpenAI Agents SDK's recommended architecture (agent definitions,
models/providers, runtime, orchestration, guardrails, tools, integrations,
observability) plus this codebase's own skill-selection layer, then
cross-checked against a separate browser-only demo-readiness audit
([artifact](https://claude.ai/code/artifact/fa3a64d6-a1ef-47ed-8273-373b8ce40c06))
to see which findings a code fix actually reaches.

This document supersedes the plan given verbally in the review conversation:
Phase 3 (guardrails) is rewritten here to replace deterministic keyword
matching with an intent/context-evaluating guardrail, and the gap register
folds in what the demo audit found.

## Component map

| OpenAI SDK concept | This codebase | Verdict |
|---|---|---|
| Agent definition | `lib/agent.ts` (customer worker), `lib/assistant-agent.ts` (admin assistant) | Solid — identity/role/tone built in code (`buildIdentityBlock`), not manager-editable template |
| Models/providers | `worker_profiles.model` free-text column, default `"gpt-5.6-luna"` | No registry/validation |
| Running agents | `run(agent, input, {maxTurns})`, one turn per HTTP request | Customer path drops conversation history entirely (Gap 1) |
| Orchestration/handoffs | Two independent `Agent` instances, routed by HTTP endpoint, no SDK `Handoff` | Fine for two fixed personas — not a gap by itself |
| Guardrails | Fully custom, pre-agent, deterministic (`lib/guardrails.ts`) | Keyword/substring matching only — rewritten below (Gap 4) |
| Tools | Composio-backed function tools (CRM, Linear, email, calendar, Jira-read) + `webSearchTool()` + skill tools | Good pattern, duplicated 6x, and 3 documented integrations aren't wired as tools at all |
| Skill-selection layer | Three sources: on-disk `SKILL.md` catalog, per-org custom skills, AIX Skills MCP repository (search-ranked) — all progressive-disclosure via `load_skill`/`search_skills` | Most mature layer in the codebase |
| Integrations/MCP | 5 hand-rolled JSON-RPC clients, none using the SDK's `MCPServerStreamableHttp` | Works, heavy duplication |
| Observability | No `@openai/agents` tracing anywhere in the repo — no exporter, no `withTrace` | Biggest blind spot |
| Human review/approval | Custom propose→confirm DB state machine (`toolApprovals`) | Deliberate, and the right call — see note below |

**Not a gap, confirmed deliberate:** the approval system intentionally avoids
the SDK's interrupt-based `RunToolApprovalItem` flow, because approvals here
arrive as a separate chat message in a later HTTP request, not a synchronous
pause inside one `run()` call. Flagging only so it isn't "discovered" later as
a missed SDK feature.

## Gap register

Each gap is tagged with its source: **[Code]** found reading the
implementation directly, **[Demo]** found in the browser-only demo-readiness
audit, **[Both]** found independently by each.

### Gap 1 — Customer-facing agent has no conversation memory [Code] — High

`/api/v1/chat` never fetches prior `messages` for the conversation before
calling `runAgent(profile, orgName, message, knowledge, orgId)` — only the
current message is passed. Compare `assistant/chat/route.ts`, which loads
`priorMessages`, replays the last `REPLAY_MESSAGE_LIMIT`, and rolls the rest
into a summary. A customer referring back to their own previous message in the
same ticket gets an agent that never saw it. The Tier 1–4 assistant work
solved this problem for the admin surface; the original customer path was
never brought up to the same standard.

### Gap 2 — Three documented integrations are configured but never callable [Code] — High

AgentDB (read-only SQL), Artifacts (write), and Agent Wiki's *write*
capability each have a full client, settings routes, and a working "Test
connection" button — but neither `lib/agent.ts` nor `lib/assistant-agent.ts`
references any of them as a `tool()`. A manager can enable these in Settings
and see a green check, and nothing changes at chat time.

### Gap 3 — No tracing/observability [Both] — High

`@openai/agents` ships `withTrace`, `OpenAITracingExporter`,
`setTraceProcessors`, per-span tracing for generations/tool calls/handoffs/MCP
calls, guardrail spans (`withGuardrailSpan`) — none of it is used anywhere in
this repo. The bespoke `toolCalls` table only logs the 6 Composio lookup
wrappers in `agent.ts`; skill searches/loads and the assistant's propose/
confirm tools are invisible even there.

The demo audit hit this directly: *"I could not confirm the search capability
is actually being exercised by the model... Distinguishing these needs
server-side logs/tool-call traces that aren't visible from the browser."*
(re: whether `lookup_jira_issue` fires for a "known issue" question, or the
worker's role scope just always escalates those regardless of what a search
would find). Tracing is the direct fix for exactly this question.

### Gap 4 — Guardrails are exact keyword matching, not intent/context evaluation [Both] — High

`lib/guardrails.ts`'s `evaluateMessage()` checks literal substrings
(`"ignore previous instructions"`, `"jailbreak"`, and the org's own
comma-separated escalation phrase list like `refund, chargeback, lawyer`) —
trivially missed by paraphrase, translation, or a customer who says "I got
billed twice and want my money back" instead of the word "refund". Nothing
runs on the output side at all. Rewritten in full below (**Plan, Phase 3**).

The demo audit's confidence-threshold confusion is a symptom of a related bug
uncovered while re-reading this code for the rewrite: **"Minimum confidence:
72%" does not gate anything.** `parseAnswer()` in `agent.ts` sets confidence
to one of three hardcoded constants — `0.9` if the model emitted
`[[RESOLVE]]`, `≤0.4` if `[[ESCALATE]]`, `0.75` otherwise — and
`confidenceThreshold` is used only to cap the *displayed* number in the
escalate case. No computed, continuous confidence score exists, so a
sub-72%-confident-but-on-scope answer can never be produced or held back by
that setting. This is why the demo audit could not produce that case to test
it (*"every test question... either had a strong knowledge match or was
clearly escalation-worthy"*) — the setting was never wired to anything that
would produce the in-between case. Folded into Phase 3 below.

### Gap 5 — No error handling around the customer-facing model call [Code] — Medium-High

`runAssistantAgent` is wrapped in try/catch in the assistant route; the
customer-facing `runAgent` call in `chat/route.ts` is not. A
`MaxTurnsExceededError` or a transient OpenAI outage 500s the public widget
instead of degrading to `needs_human` the way the rest of that file is
designed to.

### Gap 6 — Six near-identical Composio tool wrappers [Code] — Medium

`executeCrmLookup`/`executeLinearSearch`/`executeGmailSearch`/
`executeOutlookSearch`/`executeCalendarSearch`/`executeJiraSearch` are
copy-pasted (query → run → retry-once → log → stringify), ~250 lines that
will drift — Jira's already special-cases JQL escaping and nothing enforces
the others stay in sync.

### Gap 7 — Five hand-rolled MCP JSON-RPC clients [Code] — Medium

Skills-repository, Agent Wiki, Scribe, Artifacts, and part of AgentDB each
reimplement the same `fetch` + SSE-or-JSON parsing + JSON-RPC envelope logic,
rather than the SDK's `MCPServerStreamableHttp`/`getAllMcpTools`. Some of this
is deliberate (the "degrade, don't throw" semantics for Parchment need finer
control than a generic client gives), but it's currently five parallel copies
of the same low-level plumbing.

### Gap 8 — No model registry [Code] — Low-Medium

`model` is a free-text DB column defaulting to a made-up-looking string,
unvalidated on write. A bad value only fails at chat time, inside
`new Agent({model})`.

### Gap 9 — Jira issue creation/update does not exist anywhere in the product [Demo] — High, but **out of scope for this plan**

The demo audit confirmed Jira is connected (live Composio OAuth, `active`
status) and the worker can *search* helpdesk issues (`lookup_jira_issue` in
`agent.ts`, read-only), but no UI action (Inbox kebab menu, manager Assistant)
can create or update a Jira issue. This is not the same shape as Gap 2 —
there is no existing client to wire up, no Composio tool call for writes, and
no field anywhere to store which Jira site/project
(`aixccelerate-team-delec5p9.atlassian.net`, `SCRUM`) a worker's escalations
should file into. This is net-new feature work (new tool + UI action + a
mapping field, likely on `integrations_config` alongside the existing
per-worker overrides pattern Parchment already uses), not a wiring fix, and
is intentionally **not** included in the phased plan below. Flagging here so
it isn't lost.

### Gap 10 — Manager Assistant fully down in the audited environment [Demo] — RESOLVED, was not what it looked like

Every `/assistant` request returned *"I can't reach the model right now (no
OPENAI_API_KEY configured)"*. Checking Railway directly (`ai-worker-backend`,
staging) showed `OPENAI_API_KEY` **was** set — the actual cause was
`DEMO_MODE=true` on that service. Both `runAgent` and `runAssistantAgent`
share one gate:

```ts
if (isDemoMode() || !process.env.OPENAI_API_KEY) {
  return demoAssistantAnswer(); // always blames the key, even when DEMO_MODE is the real cause
}
```

so the error message can't tell the two causes apart. This also means the
customer-facing worker was never calling a real model during the audit
either — it was running `demoAnswer()`'s canned logic the whole time, which
happens to produce plausible-looking output (a knowledge match truncated to
240 chars reads like "a correct, specific answer"; the no-match fallback is
the literal sentence the audit quoted for the escalation test). The
guardrail-escalation finding itself is unaffected — `evaluateMessage()` runs
before either agent and short-circuits regardless of demo mode — but the
"Works" verdicts for triage/response and confidence/guardrail behavior in the
original audit should be read as "the demo-mode fallback produces convincing
output," not "the real model path was verified."

**Fixed and re-verified live**, 2026-09-17: `DEMO_MODE` set to `false` on
`ai-worker-backend`/staging via Railway CLI, service auto-redeployed, then
re-tested end-to-end with a real browser (Playwright) against the live
staging URLs:

- Manager Assistant (`/assistant`) now answers for real — asked "What are
  the current guardrail rules for Mike?", got a correct, specific answer
  built from its `get_worker_configuration` tool call, not the canned error.
- The public widget now returns a genuinely generated, paraphrased answer
  (markdown formatting, synthesized wording) instead of the demo mode's
  truncated `Based on "{title}": ...` snippet.
- The refund/guardrail escalation path still works correctly with the real
  model live (`confidence: 0.4`, `escalated: true`, "Manager notified"
  badge) — confirming this path was never dependent on demo mode.

One thing worth carrying into a real fix (not done here, config-only): the
shared `demoAssistantAnswer()`/error message should distinguish "demo mode is
on" from "no API key" so this isn't misdiagnosed again — small, could ride
along with Phase 0.

### Gap 11 — Frontend bugs found during the demo audit [Demo] — Low-Medium, **out of scope for this plan**

Two reproducible frontend issues, neither reachable from this backend
review: the Inbox list fails to render on first navigation until a forced
re-render (filter toggle or reload); the embeddable widget's first greeting
and header show a generic "AI Worker" instead of the configured display name
("Mike") until the first real reply arrives. Both live in
`AI-worker-frontend`/`AI-worker-frontend-assistant`, not this repo.

### Not gaps — product/content/config decisions [Demo]

Recorded for completeness, no code action implied: dashboard metrics were
genuinely at zero before any seeded activity (no seed data exists, correctly —
metrics are live, not decorative); the knowledge base currently documents the
AI Worker platform itself rather than a customer-facing product's FAQs
(content scope, not a retrieval bug); manager email is blank so escalation
emails have no destination (a settings field needs a value, not a code fix).

## Plan

### Phase 0 (hours–low days)

- Wrap `/api/v1/chat`'s `runAgent` call in try/catch, matching the assistant
  route's degrade-to-`needs_human` pattern (Gap 5).
- Product decision needed: wire AgentDB/Artifacts/Agent-Wiki-write as real
  tools, or relabel their Settings cards so they don't imply live capability
  that doesn't exist yet (Gap 2).

### Phase 1 — Observability (~2–4 days)

- Turn on Agents SDK tracing (`OpenAITracingExporter` or a custom
  `TraceProcessor` via `addTraceProcessor`/`setTraceProcessors`), tagging
  traces with `organizationId`/`conversationId` so a support conversation is
  traceable end-to-end.
- Extend tool-call visibility to cover skill search/load and the assistant's
  propose/confirm tools, which today never touch the `toolCalls` table at all.
- This directly answers the demo audit's open question about whether Jira
  search is actually being invoked for "known issue" queries.

### Phase 2 — Customer-agent conversation memory (~2–3 days)

- Port `assistant-agent.ts`'s history-replay + rolling-summary pattern (or
  adopt an SDK `Session`) into the customer chat path so multi-turn
  conversations aren't answered turn-by-turn with no memory of the thread
  (Gap 1).

### Phase 3 — Guardrails: from keyword matching to intent/context evaluation (~4–7 days, revised)

**Keep, as a zero-cost first tier:** the domain allowlist check. Domains are
structured data, not natural language — exact matching is correct there, not
a limitation to fix.

**Keep, as a defense-in-depth fast-fail, not the source of truth:** the
existing literal injection/escalation phrase list, run first and free (no
model call) to catch the laziest, most obvious attempts at zero cost and zero
added latency. This is standard layered-guardrail practice — cheap
deterministic filters first, a smarter classifier behind them — not an
either/or replacement.

**New — a free-form intent/context guardrail, replacing keyword matching as
the actual decision-maker:**

A small, fast model call (low/no reasoning effort, structured output via a
Zod schema) evaluates the *meaning* of the message against the org's
configured escalation themes — not their literal spelling — plus a short
window of recent conversation context, since intent is sometimes only legible
across turns (e.g. "I want to cancel" alone reads differently after an
earlier turn established a billing dispute). Structured output:

```ts
{
  injectionSuspected: boolean,
  escalate: boolean,
  matchedThemes: string[],   // which configured themes it matched, in the model's own words
  confidence: number,        // 0–1, genuinely computed — not the fixed-bucket value in parseAnswer() today
  reason: string,
}
```

This also fixes the dead `confidenceThreshold` setting (Gap 4's second half):
`confidence` becomes a real, continuous signal compared against
`profile.confidenceThreshold`, instead of three hardcoded constants that
never varied.

**Wiring — use the SDK's native guardrail primitive, not a bespoke pre-check
function:** `@openai/agents-core` exports the `InputGuardrail` interface
(`{name, execute, runInParallel}`) and `defineOutputGuardrail` for the output
side. Set `runInParallel: false` on the input guardrail — this reproduces
today's sequential, cost-optimal shape (never pay for the main model call when
you already know you're escalating) while still getting SDK-native tracing
(`withGuardrailSpan`) and the standard `InputGuardrailTripwireTriggered`
error, caught once in `runAgent` and mapped to the existing
"I'm bringing in {manager}" response. The SDK's own default
(`runInParallel: true`, guardrail and main call race) trades cost for latency
by always paying for the main model call even on the rare trip — worth
knowing about, but wrong for this product's current cost-conscious posture
(reasoning effort already set to `"none"`, verbosity to `"low"` everywhere).

Add a second guardrail using `defineOutputGuardrail` on the final reply,
before it's persisted or sent to the customer — catching system-prompt
leakage, a reply that contradicts the escalation the input guardrail should
have caught, or content that fails an org's own policy in ways a keyword list
never could.

**Fail-closed, deliberately unlike retrieval:** if the classifier call itself
errors or times out, treat it as `tripwireTriggered: true` (escalate). This is
the opposite of `retrieval.ts`'s "a knowledge integration going down must not
take chat down with it" philosophy, and that's intentional — losing a
citation is low-stakes, silently skipping a safety gate is not. Worth stating
explicitly in the code so the asymmetry reads as a decision, not an
inconsistency.

**Cost/latency honesty:** today's `evaluateMessage()` is a pure function —
free and instant. This replaces it with a real model round-trip on every
message (~200–500ms typically, plus token cost on a cheap model). That's the
genuine price of moving from string search to semantic understanding; size
the model choice accordingly (this is also a natural first user of the model
registry in Gap 8 — a distinct, cheaper "guardrail model" from the primary
per-worker `model`).

### Phase 4 — Tools/integrations wiring (~3–5 days depending on Phase 0's product decision)

- If wiring AgentDB/Artifacts/Agent-Wiki-write forward: build them as real
  `tool()`s mirroring the CRM/Linear pattern, gated by the same
  `requirementsMet`/active-connection check the skills catalog already uses.
- Collapse the 6 duplicated Composio lookup wrappers (Gap 6) into one
  generic factory (toolkit slug, args mapper, connection type).

### Phase 5 — Architecture hygiene (~2–4 days, lower priority)

- Consolidate the MCP client duplication (Gap 7) where "degrade, don't throw"
  isn't load-bearing.
- Introduce a small model/provider registry (Gap 8) instead of a free-text
  column, covering both the primary per-worker model and the new guardrail
  model from Phase 3.

## Explicitly out of scope

Not addressed by any phase above, and not attempted here:

- **Jira write actions** (Gap 9) — net-new feature, not a wiring fix. Needs a
  separate scoping decision (build before demo / narrate manually / drop).
- **`OPENAI_API_KEY` for the manager Assistant** (Gap 10) — environment
  configuration on the deployment host, not this codebase.
- **Frontend bugs** (Gap 11) — Inbox stale-render-on-navigation, widget's
  generic first greeting — live in the frontend repos.
- **Content/product decisions** — knowledge base scope, manager email,
  demo seed data.
