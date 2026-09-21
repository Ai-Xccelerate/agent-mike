# Architecture

Agent Mike is the current AI Worker Foundation product with Mike's AIX platform
adapters layered on top. Foundation owns the application behavior and UI;
Mike-specific code owns Clerk/Core access, organization tenancy, deployment
wiring, and product identity. The API is Next.js + OpenAI Agents SDK +
Drizzle/Postgres; the manager UI is a separate Next.js service under
`frontend/`.

## Identity and tenancy

All domain routes still resolve tenancy through `lib/identity.ts`.

- On Mike Railway, middleware verifies the Clerk JWT, validates `azp`, and
  checks AIX Core's `agents/mike/access` entitlement.
- Middleware discards any inbound `x-aix-verified-*` headers, then writes its
  verified org/user/role context for `ClerkCoreIdentityAdapter`.
- Public widget traffic resolves its org from an active `widget_sites` token.
- Local development can use the standalone adapter. Railway cannot fall back
  to standalone or `MIKE_ALLOW_LOCAL_UNAUTH`.

Every product table is organization-scoped using the Clerk organization id.

## Request lifecycle

1. Manager requests arrive with a Clerk bearer token. Widget requests carry
   `x-worker-site-token` (or legacy `x-mike-site-token`).
2. The identity adapter resolves the Clerk org or widget site's org.
3. The message is persisted; deterministic and model guardrails run; local and
   enabled external knowledge sources are retrieved.
4. The OpenAI Agents SDK runs with Mike's profile, memory, skills, connected
   Composio tools, and approval policy.
5. Replies, citations, tool calls, confidence, summaries, and handoff state are
   persisted for Inbox.

## Configuration

One `worker_profiles` row per organization controls identity, prompts, model,
guardrails, channels, skills, tools, and integrations. New profiles are Agent
Mike (`slug=mike`, `ticket_prefix=AIX`); migrated profile values are preserved.

The Foundation route and component trees remain canonical. Platform adapters
must not introduce Mike-only product endpoints or alternate UI flows.

See [MIGRATION.md](./MIGRATION.md) for compatibility contracts and
[DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) for deployment.
