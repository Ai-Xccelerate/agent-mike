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

## Email channel (Nylas)

Each organization answers email sent to its own connected mailbox. Everything
is per organization and set up in the UI; Railway env values are only the
fallback for organizations that use the shared Nylas application.

Setup, per organization:

1. **Nylas application**: Settings > Tools > Mailbox > Nylas application.
   Use the shared one (`NYLAS_CLIENT_ID`, `NYLAS_API_KEY`, `NYLAS_API_URI`,
   `NYLAS_WEBHOOK_SECRET` on the API service), or save the organization's own
   client ID, API key and webhook secret (encrypted; needs `ENCRYPTION_KEY`).
2. **Mailbox**: Connect mailbox (Google/Outlook sign-in), or paste the grant ID
   of a mailbox that already exists in that Nylas application, such as a Nylas
   agent account (`POST /api/v1/mailbox/attach`). A grant belongs to one
   organization only.
3. **Webhook**: on the Nylas application, create a webhook pointing at the
   URL the Mailbox card shows (`/api/v1/webhooks/nylas`), trigger
   `message.created` only, compression off. Save its secret in step 1.
4. **Channels > Email** on (off by default).

What happens (`lib/email-channel.ts`):

- The webhook finds the organization from the delivery's grant id, verifies
  the signature with that organization's webhook secret, and ignores the
  mailbox's own sent mail. It answers Nylas immediately; the agent turn runs
  after. A retried delivery is a no-op (`messages.external_message_id` is unique).
- One email thread is one conversation (`conversations.external_thread_id`).
  Only the new text is stored, not the quoted thread.
- The agent turn is the same as chat (`lib/customer-turn.ts`): guardrails,
  knowledge, handoff, summary. The reply is emailed in the same thread.
- Handoff marks the conversation "needs human" and emails `managerEmail`.
- Taken over (Inbox "Take over", or any manager reply): the worker stays quiet.
  A manager reply on an email conversation is emailed to the customer in the
  thread; if the send fails, nothing is saved and the Inbox shows why.
- Role > Automatic replies off: replies are drafted in the Inbox, not sent.
- Settings > Email domains > "Only email approved domains" (off by default)
  restricts every Nylas send, replies included, to approved domains.

## Every other action a connected app offers

Beyond the hand-wired lookups below (`lookup_my_tickets`, `search_confluence`,
`lookup_crm_contact`…), the agent can use any Composio action of a connected
app: create or update a Linear issue, add a comment, transition it, update
a Zoho record, create a calendar event, send email and so on (Jira and
Confluence are excluded for the customer agent; see below). It gets two tools
rather than hundreds, because a single model request can't carry every action
Jira alone offers:

- `search_integration_actions`: searches the connected toolkits' actions
  (`getRawComposioTools`) and returns each one's name, parameters and whether
  it needs approval.
- `run_integration_action`: runs one by slug. Code in
  `lib/tools-integrations/composio-actions.ts`.

Every run goes through `lib/tools-integrations/action-policy.ts`, which sorts
the action by its slug (and Composio's read-only/destructive hints) into a tier:

| Tier | Examples | Runs on its own? |
|---|---|---|
| read | `JIRA_GET_ISSUE`, `GMAIL_FETCH_EMAILS` | Always |
| routine | `JIRA_CREATE_ISSUE`, `JIRA_ADD_COMMENT`, `JIRA_TRANSITION_ISSUE`, `ZOHO_UPDATE_RECORD` | Only when "A manager approves every change" (`requireWriteApproval`, Guardrails) is off |
| email | `GMAIL_SEND_EMAIL`, `GMAIL_REPLY_TO_THREAD`, `OUTLOOK_SEND_EMAIL` | Only with that switch off **and** every recipient is the conversation's `customerEmail` |
| risky | assign, bulk/batch, share, move, forward, anything touching users, roles or priority, and anything unrecognised | Never |
| delete | delete, remove, trash, purge | Never |

Anything that doesn't run is queued in `tool_approvals` as `composio_action`
(slug, app, toolkit version, arguments) and shown on that conversation in the
Inbox with Approve / Reject. Approving runs it against the app's current
connection (`applyComposioActionApproval`); if the app was disconnected
meanwhile, it fails rather than running elsewhere. Every run, queue and failure
is logged in `tool_calls` as `run_integration_action`.

Limits worth knowing:

- The tier comes from the action's name, not its arguments. `JIRA_EDIT_ISSUE`
  is routine even if its fields change the assignee or priority. Keep the
  approval switch on until that's acceptable for the deployment.
- `customerEmail` isn't set by any channel yet (inbound email will set it), so
  today every email action waits for a manager.
- Settings > Email domains doesn't apply to these sends; the recipient rule
  above does.

## Jira and Confluence (Atlassian)

Both are connected per org under Settings > Integrations, through Composio
(OAuth): Jira as the Helpdesk (`COMPOSIO_JIRA_AUTH_CONFIG_ID`), Confluence as
the Knowledge base (`COMPOSIO_CONFLUENCE_AUTH_CONFIG_ID`). Their own settings
live on the connection row (`integration_connections.metadata.settings`),
are copied to `integration_settings` so a disconnect and reconnect keeps them,
and are edited from the gear on each card (`PATCH /api/v1/integrations/:type`).
Jira's project and issue type are picked from what the connection can see
(`GET /api/v1/integrations/helpdesk/jira-projects`) and checked against Jira
before saving: a type the project doesn't have would fail every handoff.
For a Jira Service Management project the dialog offers its request types
instead: with one set, handoffs go through the service desk request API
(`/rest/servicedeskapi/request`, called through Composio's proxy on
`api.atlassian.com/ex/jira/{cloudId}`), so they carry a request type and show
in the desk's queues and portal. Composio has no action for that API.
Code: `lib/tools-integrations/atlassian.ts`.

| Setting | Default | What it does |
|---|---|---|
| Jira `projectKey`, `issueType` | unset | Where handoff tickets go, e.g. `SUP` / `Task` |
| Jira `requestTypeId` | unset | A service desk request type, e.g. `8` (Report a system problem). Wins over `issueType`; the name is stored from Jira as `requestTypeName` |
| Jira `createTicketOnHandoff` | on | Raise a ticket on every handoff (needs a project and an issue or request type) |
| Confluence `spaceKey` | every space | The space answers come from |
| Confluence `searchBeforeAnswering` | on | Search page text before every answer |

**Customer-facing worker** (`lib/agent.ts`, `lib/customer-turn.ts`):

- Handoff: when a turn escalates, the code (not the model) creates the Jira
  issue with the conversation transcript, stores its key on
  `conversations.external_ticket_key`, and appends "I've logged this for the
  team as SUP-12…" to the reply. A later handoff on the same conversation adds
  a comment instead. If Jira refuses, the handoff still happens; Jira's reason
  is stored on `conversations.external_ticket_error`, shown in the Inbox
  header and the manager's handoff email, and flagged by the Assistant's audit.
- `lookup_my_tickets`: the status of this customer's own tickets only (keys
  stored on this conversation, or on others with the same customer email).
  There is deliberately no free-text search of the project: it would let
  anyone in a chat read other customers' tickets.
- Knowledge: Confluence is searched full-text (CQL, keywords from the
  question) in `lib/retrieval.ts` before every answer, alongside local
  knowledge, Parchment, Scribe and Agent Wiki. The model also keeps
  `search_confluence` (title match) and `read_confluence_page`.
- `search_integration_actions` / `run_integration_action` exclude Jira and
  Confluence for this agent (`CUSTOMER_EXCLUDED_TOOLKITS`).

**Assistant** (`lib/assistant-agent.ts`):

- Read, for everyone including read-only members: `search_jira_issues`
  (any project; the handoff project by default), `read_jira_issue`,
  `search_confluence_pages` (full text), `read_confluence_page`.
- Change, with "Let the Assistant take actions" on: `search_integration_actions`
  then `propose_integration_action` (any action of any connected app: create
  or edit a ticket, comment, transition, create a page). It's a proposal like
  every other Assistant action; it runs after the manager approves, against
  the connection as it is then.

Page text the customer agent reads counts as approved reference material for
the reply check (lib/guardrails.ts). Toolkit versions are pinned in
`JIRA_TOOLKIT_VERSION` / `CONFLUENCE_TOOLKIT_VERSION`.

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
