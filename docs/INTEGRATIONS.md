# Integrations

An integration is an externally-connected system (R6). The Foundation talks to
it over its own API and never bakes it into the agent harness. Per-worker state
lives in `worker_profiles.integrations_config` (jsonb), so adding an integration
is configuration plus a client module — not a new table per integration.

## Two independent gates

| Gate | Set by | Where |
|---|---|---|
| `available` | Operator | Server env (credentials) |
| `enabled` | User | `integrations_config.<key>.enabled` |

`active = available && enabled`. `available: false` always wins — a deployment
without credentials never calls out, whatever the toggle says. `PATCH` refuses
to set `enabled: true` while the server is unconfigured, so the UI can never
show an "on" toggle that cannot do anything.

## Parchment

Grounds the worker's answers in the organization's Parchment knowledge base.

Implements the **internal AIX Core agent path** from Parchment's
`docs/agent-integration-internal.md` — three headers, no per-workspace API key
to mint, no Parchment signup step:

```
X-Internal-Key: <PARCHMENT_INTERNAL_AGENT_KEY>
X-Clerk-Org-Id: <the org id Parchment knows this org by>
X-Agent-Id:     <attribution label; defaults to the worker slug>
X-Workspace-Id: <optional; omit for the org's default workspace>
```

**Access ceiling is the `agent` role**: read + staged proposals. This worker
only calls `POST /query`. It cannot ingest, edit or delete — `/ingest` is
editor-gated and returns 403 on this path by design.

### Environment

```bash
PARCHMENT_API_URL=https://parchment-api-staging.aiworkforce.md
PARCHMENT_INTERNAL_AGENT_KEY=   # shared secret — server-only, never to a browser
PARCHMENT_AGENT_ID=             # optional; falls back to the worker's slug
PARCHMENT_ORG_ID=               # see "Org id" below
```

`PARCHMENT_INTERNAL_AGENT_KEY` is a server-only secret. It is never serialized
by any route (`GET /api/v1/integrations` returns the host, never the key) and
never logged.

### Org id

Parchment keys organizations on `clerk_org_id`. **This Foundation build has no
Clerk** (see `lib/identity.ts` — the standalone identity adapter resolves every
request to the `default` org), so the value has to be supplied. Resolution
order:

1. `integrations_config.parchment.orgId` — per-worker override
2. `PARCHMENT_ORG_ID` — server env
3. the local org id (`default`) — last resort

Getting this wrong points the worker at a different org's workspace, and the
first call with an unrecognised id **lazily provisions a brand-new org and
workspace in Parchment**. Set it deliberately. `GET /api/v1/integrations`
returns the resolved `org_id` so a misconfiguration is visible rather than
silent.

### Why the toggle defaults to on

The integration doc is explicit that Parchment access is *default-allow*, and
that an opt-in toggle would gate something that is not actually gated. The
toggle is therefore an **opt-out**: "stop grounding this worker in Parchment".
It still defaults to inert on a fresh deployment, because `available` is false
until the env vars are set.

### Retrieval behaviour

`lib/retrieval.ts` is the agent's single retrieval entry point. It always
queries local `knowledge_chunks`, then adds Parchment when the integration is
active. Parchment is **additive grounding, never a replacement**:

- A Parchment failure (auth, network, timeout — 8s) is caught, logged once, and
  reported in the response's `knowledge_sources[].error`. Chat still answers
  from local knowledge. A knowledge integration going down must not take chat
  down with it.
- Results are **interleaved**, not merged by score. Parchment's `score` and
  Postgres `ts_rank_cd` are different scales and are not comparable; sorting one
  combined list by rank would let whichever scale runs larger crowd the other
  out entirely.
- Parchment sections carry a `parchment:` prefix on `documentId` so they can
  never be mistaken for a local `knowledge_documents` row id.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/integrations` | List every integration and its status |
| GET | `/api/v1/integrations/parchment` | Status + the org's workspaces (live `/resolve`) |
| PATCH | `/api/v1/integrations/parchment` | `{ enabled?, workspaceId?, orgId? }` |

`PATCH` validates with Zod and returns `422 { error, errors: { field: message } }`.

`GET /api/v1/integrations/parchment` calls Parchment's `/resolve` only when the
integration is active, and degrades to `error` + an empty workspace list if that
call fails — the settings screen must still render (and still let you toggle it
off) when Parchment is down.

### Known upstream quirk

The integration doc's error table maps `403` to "internal path disabled". In
practice, staging returns:

- `POST /query` → **401** `Invalid internal credential, or missing X-Clerk-Org-Id / X-Agent-Id`
- `POST /internal/orgs/{id}/workspaces/resolve` → **403** `Invalid internal key`

for the *same* bad key. Both statuses are therefore treated as credential
problems, and Parchment's own `detail` is quoted in the error message rather
than inferred from the status.
