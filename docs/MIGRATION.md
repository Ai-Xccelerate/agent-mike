# AI Worker Foundation migration

## Repository and deployment boundary

This repository keeps Mike's Git history and Railway project, but the current
AI Worker Foundation backend and frontend trees are the product baseline. Their
Git histories are merged as parents of the migration branch. Mike-specific code
is then layered on only for Clerk/Core authentication and authorization,
organization tenancy, deployment wiring, product identity, and compatible
identity headers. The source Foundation repositories, their `staging` branches,
and the Railway project `AIX worker` are not modified or redeployed.

Foundation product behavior is not forked here. Routes, agent behavior,
guardrails, Inbox, knowledge, settings, integrations, tools, skills, and UI
structure must remain equivalent to current Foundation staging unless a
documented platform adapter requires a narrow difference.

Mike remains a two-service deployment:

- `mike-api`: repository root
- `mike-frontend`: `frontend/`
- Mike's existing Railway Postgres volume

## Contracts that must remain synchronized

1. **Clerk:** frontend and API use the shared AIX Clerk instance. API JWT
   verification requires `CLERK_JWKS_URL`, `CLERK_ISSUER`, and the Mike/Core
   origins in `CLERK_AUTHORIZED_PARTIES`.
2. **AIX Core:** catalog slug is exactly `mike`. Manager access fails closed
   through `GET /api/v1/agents/mike/access`. Core outages, missing catalog
   registration, and denied entitlements do not fall back to standalone mode.
3. **Domains:** Mike frontend must be present in Clerk redirects, API CORS, and
   Core's product URL registration. The frontend rewrites `/api/v1/*` to
   `NEXT_PUBLIC_API_URL`.
4. **Widget:** new embeds send `x-worker-site-token`; legacy Mike embeds using
   `x-mike-site-token` continue to work. Tokens remain org-scoped in
   `widget_sites`.
5. **Nylas:** use Foundation's hosted mailbox OAuth flow and org-scoped
   `nylas_mailboxes` behavior. Mike does not retain its former custom grant
   binding or inbound auto-reply API.
6. **Composio:** `COMPOSIO_API_KEY` and all `COMPOSIO_*_AUTH_CONFIG_ID`
   variables belong on `mike-api`, never the browser. Connected accounts are
   keyed by Clerk organization id.
7. **Ticket identity:** new Mike profiles default to `Agent Mike`, slug `mike`,
   mailbox `agent.mike@wkr.email`, and ticket prefix `AIX`.

## Foundation synchronization policy

When Foundation `staging` changes, compare both source trees against this
repository. Port all product changes. The expected Mike-only code surface is:

- backend Clerk/Core verifier and middleware integration;
- Clerk-backed `IdentityAdapter` tenancy;
- frontend Clerk provider, access gate, and bearer-token bridge;
- Mike Railway/env/domain wiring and health/product identity;
- the in-place legacy-to-Foundation database migration.

Any other product-code difference requires explicit documentation and review;
Mike's former endpoints are not a compatibility target.

## Database strategy

Do not apply Foundation's original `0000`–`0022` lineage to Mike's database.
This repository retains Mike's deployed `0000_mike_init`,
`0001_nylas_mailboxes`, and `0002_widget_sites`, followed by one
`0003_migrate_to_foundation` migration.

`0003`:

- renames `agent_profiles` to `worker_profiles`;
- converts UUID-shaped text primary/foreign keys to native UUID without
  replacing values;
- preserves conversations, messages, knowledge, widget tokens, Nylas grants,
  Clerk organizations, users, and memberships;
- adds Foundation settings, integrations, approvals, skills, and email-domain
  tables;
- retains legacy identity tables as unmanaged compatibility data;
- copies active Clerk memberships into `worker_users`.

Railway's backend start command runs `drizzle-kit migrate` before starting.
Take a Postgres snapshot immediately before the first preview/cutover deploy.

## Cutover gate

Deploy only to an isolated Mike Railway preview first. Verify:

- Core login, denied-access and allowed-access behavior;
- migrated row counts and representative records;
- manager chat, public widget, Inbox takeover/status, Knowledge, Settings;
- Foundation's Nylas mailbox connect/status/test/disconnect flow;
- each configured Composio toolkit connect/test/disconnect path;
- Foundation API/UI parity plus Mike health and platform-auth contracts.

Merging to Mike `staging` and deploying against the live Mike database requires
explicit cutover approval after those checks pass.
