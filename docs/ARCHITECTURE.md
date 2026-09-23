# Architecture

## Why this exists

This is the AI Worker Foundation's API — a from-scratch rebuild, not a copy of
any deployed agent. `agent-mike` (both its `main` and `staging` branches) was
used as reference for patterns that are genuinely generic (the OKF-markdown +
Postgres full-text-search knowledge approach, the guardrails shape), but
nothing was inherited wholesale, because both branches are one product's
implementation history, not a template:

- `main`: FastAPI + Python + `claude-agent-sdk` — wrong SDK (R1 requires
  OpenAI Agents SDK), no multi-tenancy at all.
- `staging`: the real, correct SDK choice (`@openai/agents`), but with Clerk
  and an external "AIX Core" catalog service hard-wired into the middleware
  itself — every route depended on a specific auth vendor and a specific,
  externally-owned catalog registration just to boot.

## The identity seam

R6 already requires business-system integrations (CRM, ticketing) to be
decoupled, external, and never baked into the worker. This codebase applies
the same rule to identity/access: see `lib/identity.ts`.

Every route resolves "who is this, which org" through an `IdentityAdapter`
interface, not through a specific auth vendor. The default implementation,
`StandaloneIdentityAdapter`, resolves every manager request to one fixed org
with no login required — one deployment is one tenant, configured directly,
matching Rahul's own framing in the planning meeting: a repo that "can be
taken and deployed left, right, and center" doesn't need SaaS login
infrastructure to be useful. A platform-specific adapter (Clerk + AIX Core,
or anything else) plugs in later, at the point a worker actually joins a
real multi-tenant platform, without this codebase ever needing to know that
vendor exists.

The schema is still fully multi-tenant-shaped (`organization_id` on every
table) per R16 — the adapter, not the schema, is what's swapped.

## Request lifecycle

1. A message arrives at `/api/v1/chat`, either from the manager test bench
   (no site token) or the public widget (`x-worker-site-token` header).
2. The identity adapter resolves an org. Widget requests with no matching
   token are rejected; manager requests always resolve (standalone mode).
3. The message is persisted, guardrails run deterministically first
   (injection phrases, escalation terms, domain allowlist), then relevant
   knowledge is retrieved via Postgres full-text search.
4. If guardrails didn't already force escalation, a single `@openai/agents`
   turn runs with the org's system-prompt template, tone, and role filled in,
   and the retrieved knowledge attached as untrusted reference material.
   `DEMO_MODE=true` (or a missing `OPENAI_API_KEY`) skips the live call and
   returns a canned response instead.
5. The reply and any citations are persisted; low-confidence or
   guardrail-triggered turns are marked `needs_human`.

## Configuration surface (R14 / R15)

Every field a manager can change lives on one `worker_profiles` row per org,
exposed via `GET`/`PATCH /api/v1/worker` — including the system prompt
template itself (R15: "your system prompt... must be exposed... to configure
it"), not just the identity/tone fields around it.

## Deliberately not built yet

- A generalized business-system (CRM/ticketing) tool-call pattern (R6) — the
  agent runs with zero tools today.
- Domain/user verification as a callable pattern (R11) — the allowlist check
  exists; the "confirm this is a real customer" lookup does not.
- A skills library (R9) — format still unspecified (PRD OQ5).
- Voice channel (R12) — deferred, matches the plan.
