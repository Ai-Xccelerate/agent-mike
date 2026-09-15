# Tools, integrations and controls

What a manager can connect this worker to, what each connection is allowed to
do, and who the worker may talk to outside the organization.

Two repos, one feature: `AI-worker-backend` holds the clients, the state and the
routes; `AI-worker-frontend` holds the screens. PRs:
[backend #6](https://github.com/Ai-Xccelerate/AI-worker-backend/pull/6),
[frontend #3](https://github.com/Ai-Xccelerate/AI-worker-frontend/pull/3).

---

## 1. Integrations

Five externally-connected systems. None of them is baked into the harness: each
is state in `worker_profiles.integrations_config`, so adding the sixth is
configuration, not a migration per integration.

**Two independent things decide whether an integration runs.**

- `available` — the server holds credentials for it. Set by env, not editable.
- `enabled` — the worker's own toggle. The manager's decision.

Both must be true. `available: false` always wins, so a deployment without
credentials never calls out, whatever the toggle says.

| Integration | Access | Default | Why that default |
|---|---|---|---|
| **Parchment** | read | **on** | Access is not gated upstream. A toggle would gate something that is not actually gated, so it reads as an opt-out. |
| **AgentDB** | read — single `SELECT` | off | The internal path's scope is always full. Connecting a worker to the org's live database is a deliberate opt-in. |
| **Scribe** | read | off | The risk is disclosure, not mutation. Meeting transcripts are internal talk. |
| **Agent Artifacts** | **write** | off, draft-only | It creates artifacts that belong to the workspace and count against its quota. Publishing to a live URL is a second, separate opt-in. |
| **Agent Wiki** | read + **write** | off, read-only | A wiki can be renamed, moved and deleted. Writing is a separate decision from reading. |

### AgentDB

Read-only access to the organization's database. Queries must be a single
`SELECT`; writes, DDL and multi-statement SQL are refused **before they are
sent**, not after the database rejects them.

Auth is the AIX Core internal-agent path — three headers, no per-workspace API
key — plus MCP. It is the widest-reaching integration here, which is why it
arrives switched off: the internal path's scope is always full, the same blast
radius as a Connect "full" key.

One wrinkle worth knowing: AgentDB needs a signed-in user's token the first
time an organization is switched on, and this build has no sign-in. If the
connection test reports the org is not enabled, set `AGENTDB_ENABLE_JWT` once,
or have the org enabled from another AIX product. Day-to-day queries never need
it, and the API reports `can_enable_org` so the state is visible rather than a
silent failure.

### Agent Wiki

Search and read the organization's wiki spaces; optionally write to them.

**The tool surface is discovered, not hardcoded.** The service publishes no
schema unauthenticated, and a wiki's tool names are exactly the sort of thing
that gets renamed — so `listTools` asks the server and `resolveSearchTool` picks
the search tool out of that answer. A rename surfaces on the settings screen
instead of failing silently at chat time.

**`allowWrite` never grants anything.** Agent Wiki issues a key against whoever
created it, and the server refuses writes that key was not granted — whatever
the worker's setting says. So there are two brakes, and the server's is
authoritative; the toggle can only withhold. The API reports `key_can_write`
from the live tool list next to it, so the card can say *"this key cannot change
pages, so writes will be refused regardless of this switch."*

### Retrieval

Parchment, Scribe and Agent Wiki feed `lib/retrieval.ts` alongside local
knowledge. Three decisions there:

- **Concurrent.** A worker with three knowledge integrations must not wait for
  the sum of their latencies on every message.
- **Failures degrade, never throw.** A lookup that fails becomes
  `sources[].error` for the UI. A knowledge integration going down must not take
  chat down with it.
- **Round-robin, not sorted by rank.** Postgres `ts_rank`, a Parchment score and
  a citation ordering are not comparable scales. Sorting would let whichever
  scale runs largest crowd the others out entirely.

---

## 2. Email domains

Who outside the organization the worker may share activity with.

**An allow-list, not a block-list.** A domain nobody approved is refused, so an
empty table means the worker reaches nobody outside the org — the safe failure.

Three states, each answering a different question:

- **pending** — someone asked. Nothing is allowed yet.
- **approved** — a manager said yes.
- **revoked** — it was allowed and is not now, or the request was turned down.

A decision never deletes the row. Revoking keeps the domain and its
justification, so the record of what was allowed survives and putting one back
is one click rather than retyping it from memory.

Two design decisions worth flagging:

- **Input is normalized before storage.** `Acme.com`, `hi@ACME.com` and
  `https://acme.com/` all reduce to `acme.com`, so they cannot become three
  separately-approvable rows.
- **Approving `acme.com` does not approve `mail.acme.com`.** A subdomain can be
  controlled by someone the approver never considered. If subdomains should be
  inherited, that is a deliberate change, not an oversight.

The screen is an approval queue rather than a settings form, because that is
what it is — a domain arrives as a request, added by a manager or raised by the
worker mid-conversation, and someone has to say yes. Every action writes
immediately; a half-saved allow-list is the one state this screen must not be
in.

---

## 3. Avatar upload

`POST` / `DELETE /api/v1/worker/avatar`, served by
`GET /api/v1/uploads/avatars/[filename]`. PNG, JPEG or WebP, 1 MB maximum.

Served through **a route handler, not Next's static `public/`**: `public/` is
copied at build time, so a file written at runtime works under `next dev` and
then 404s in a production build. Serving under `/api/v1` also means the stored
URL travels the rewrite the frontend already has — no proxy config changed.

Filenames carry random bytes, so two orgs uploading `avatar.png` cannot collide
and a changed avatar is never masked by a cached response. The old file is
deleted only *after* the profile points at the new one, and only when the
previous URL is one this server issued — an external CDN URL is never touched.

**Known limit:** uploads live on the API service's own disk, so on a host with
an ephemeral filesystem they do not survive a redeploy. The external URL field
remains, labelled as the durable option.

---

## 4. Knowledge

Rebuilt around the two ways material actually arrives: files that already exist
(PDF, Markdown, text — dropped anywhere on the library panel) and a short doc
written by hand that never was a file. Both end up as one OKF concept document,
indexed for retrieval.

Partial success is treated as normal, because it is: five files where two fail
is a real outcome, so results are reported per file and only the failures stay
queued — "try again" means the ones that need trying again.

---

## 5. What the screens say, and what they no longer say

The integration cards were originally written for whoever deploys the service.
They printed the env vars each integration needs, endpoints, workspace and org
ids, and the full tool list each key grants.

That is the right answer for a deployer and the wrong one on a product screen: a
manager cannot act on a variable name, and printing it leaks the server's
configuration into the UI. All of it is gone. An unconfigured card now says
*"Not connected yet — an administrator sets this up on the API service."* The
detail is still in the API response for support and logs.

What stayed is what changes behaviour: status, the toggles, meeting window,
brand kit, space, publish and write permissions, and Test connection — plus
Agent Wiki's read-only-key warning, which explains why a switch will not take
effect.

**External tools** lists **Nylas** and **Evermind.ai** as placeholders — no
credentials, no calls, inert toggles, links to each vendor's docs. They are
listed so the shape of what is coming is visible on the screen it will land on.

---

## 6. Environment

Every integration fails closed: unset either half of a credential and it reports
as unavailable and never calls out.

```
PARCHMENT_API_URL / PARCHMENT_INTERNAL_AGENT_KEY   (+ AGENT_ID, ORG_ID)
AGENTDB_API_URL   / AGENTDB_INTERNAL_AGENT_KEY     (+ AGENT_ID, ORG_ID, ENABLE_JWT)
SCRIBE_MCP_URL    / SCRIBE_MCP_TOKEN
ARTIFACTS_MCP_URL / ARTIFACTS_MCP_TOKEN            (+ ORG_ID, display only)
AGENT_WIKI_MCP_URL / AGENT_WIKI_API_KEY            (+ KEY_LABEL, display only)
UPLOADS_DIR                                        (default: public/uploads)
```

Tokens are server-only: never returned from a route, never logged, never shipped
to a browser. The settings API returns hosts and labels, not credentials.

---

## 7. Verification

| Check | Result |
|---|---|
| Backend tests | 110 across 9 files, passing |
| Backend `tsc --noEmit` | clean |
| Frontend `tsc --noEmit` | clean |
| Frontend lint | no new errors (14 pre-existing, in 8 unrelated files) |
| Settings pages | all render 200 |

Routes were exercised against a local Postgres, including the paths that should
fail: wrong image type `422`, oversized image `422`, no file `400`, path
traversal `404`, duplicate domain `409`, unknown id `404`, and enabling an
integration with no credentials `422`.

### Not done yet

- Agent Wiki is wired but unconfigured — it needs a key from Agent Wiki →
  Settings → API keys in `AGENT_WIKI_API_KEY`.
- Nylas and Evermind are placeholders only.
- Object storage for avatars, which is what would make uploads survive a
  redeploy.
