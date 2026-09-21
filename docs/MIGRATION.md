# AI Worker Foundation migration

## Repository and deployment boundary

This repository keeps Mike's Git history and Railway project. The Foundation
backend and frontend histories are merged as parents of the migration branch,
then their current trees are adopted here. The source Foundation repositories,
their `staging` branches, and the Railway project `AIX worker` are not modified
or redeployed by this migration.

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
5. **Nylas:** grant-to-org mapping remains in `nylas_mailboxes`. Inbound
   `message.created` events go to `/api/v1/webhooks/nylas` and require
   `NYLAS_WEBHOOK_SECRET`.
6. **Composio:** `COMPOSIO_API_KEY` and all `COMPOSIO_*_AUTH_CONFIG_ID`
   variables belong on `mike-api`, never the browser. Connected accounts are
   keyed by Clerk organization id.
7. **Ticket identity:** new Mike profiles default to `Agent Mike`, slug `mike`,
   mailbox `agent.mike@wkr.email`, and ticket prefix `AIX`.

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

## Compatibility API

The Foundation API is canonical. During migration, these Mike contracts remain:

- `/api/v1/agent` aliases `/api/v1/worker`;
- `/api/v1/mailboxes` supports Mike's env-grant binding;
- `/api/v1/dashboard`, `/api/v1/knowledge/graph`, and
  `/api/v1/transcribe` remain available;
- `/api/v1/conversations/:id/status` remains available;
- `/api/v1/webhooks/nylas` keeps inbound email threading and auto-replies.

## Cutover gate

Deploy only to an isolated Mike Railway preview first. Verify:

- Core login, denied-access and allowed-access behavior;
- migrated row counts and representative records;
- manager chat, public widget, Inbox takeover/status, Knowledge, Settings;
- Nylas mailbox status plus a signed inbound webhook;
- each configured Composio toolkit connect/test/disconnect path;
- Mike compatibility endpoints and health payloads.

Merging to Mike `staging` and deploying against the live Mike database requires
explicit cutover approval after those checks pass.
