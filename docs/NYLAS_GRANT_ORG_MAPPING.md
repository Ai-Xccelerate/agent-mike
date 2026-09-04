# Nylas grant ↔ organization mapping

## Problem

AgentMail was configured as a single shared inbox (`agent-mike@agentmail.to`) with one API key. Mike stamped inbound mail with a static org env var (`AGENTMAIL_ORG_ID` / `MIKE_WIDGET_ORG_ID`). That is not pod-per-org isolation.

Nylas Agent Accounts expose a **grant** per connected mailbox. Multi-tenant Mike needs **grant → Clerk org** resolution on every inbound webhook and **org → grant** on every outbound send.

## Model (v1)

Table `nylas_mailboxes`:

| Column | Role |
|---|---|
| `organization_id` | Clerk org that owns conversations for this mailbox (unique) |
| `grant_id` | Nylas grant id (unique) |
| `email` | Mailbox address (used to skip Mike's own outbound) |
| `active` | Soft-disable without deleting history |

**Invariants**

- One active mailbox per org (unique on `organization_id`).
- One org per grant (unique on `grant_id`).
- Unknown `grant_id` on webhook → accept and ignore (no cross-tenant stamp).
- Deployed environments fail closed on missing webhook secret.

## Resolution flow

```
Inbound webhook
  → verify HMAC (NYLAS_WEBHOOK_SECRET)
  → read grant_id from event
  → mailboxByGrantId(grant_id)  // may bootstrap from env once
  → store conversation under mailbox.organization_id
  → fetch/reply using mailbox.grant_id

Outbound (chat escalation / human reply)
  → mailboxByOrgId(tenant.orgId)
  → send via that grant
```

## Staging bootstrap (no admin UI yet)

Env vars seed the first row on first use:

- `NYLAS_GRANT_ID`
- `NYLAS_ORG_ID` (falls back to `MIKE_WIDGET_ORG_ID`)
- `NYLAS_EMAIL`

App-wide (not per-org):

- `NYLAS_API_KEY`
- `NYLAS_API_URI` (default `https://api.us.nylas.com`)
- `NYLAS_WEBHOOK_SECRET`

Adding a second customer later = insert another `nylas_mailboxes` row (admin API later). Do **not** point a second org at the same grant.

## What this is not

- Not Nylas Hosted Auth / Connect for end customers (yet). Staging uses one Agent Account grant you create in the Nylas dashboard.
- Not AgentMail pods. Pods were never used in Mike's code path.
