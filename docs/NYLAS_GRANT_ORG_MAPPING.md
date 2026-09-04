# Nylas grant ↔ organization mapping

## Model

Table `nylas_mailboxes`:

| Column | Role |
|---|---|
| `organization_id` | Clerk org from the manager’s JWT when the mailbox was attached |
| `grant_id` | Nylas grant id (unique) |
| `email` | Mailbox address (used to skip Mike’s own outbound) |
| `active` | Soft-disable without deleting history |

**Invariants**

- One active mailbox per org.
- One org per grant.
- Unknown `grant_id` on webhook → accept and ignore.
- **No `NYLAS_ORG_ID` (or any env org stamp) for email tenancy.**
- `NYLAS_GRANT_ID` is app-wide for this deploy; managers never paste it in the UI.

## Resolution

```
Inbound webhook (no Clerk session)
  → verify HMAC (NYLAS_WEBHOOK_SECRET)
  → grant_id from event
  → nylas_mailboxes.grant_id → organization_id

Manager / outbound
  → Clerk JWT org_id
  → nylas_mailboxes.organization_id → grant_id
```

Provision via authenticated API: `GET/PUT /api/v1/mailboxes` (org from JWT).
`PUT` reads `grant_id` from `NYLAS_GRANT_ID` and accepts only `email` from the client.
Settings UI never displays the grant UUID.

## App-wide env (not per-org)

- `NYLAS_API_KEY`
- `NYLAS_API_URI` (default `https://api.us.nylas.com`)
- `NYLAS_WEBHOOK_SECRET`
- `NYLAS_GRANT_ID` (grant UUID for this Mike deploy)
- `NYLAS_MAILBOX_EMAIL` (optional default when binding)

## Widget note

Public widget chat uses **per-org** rows in `widget_sites` (Chat → Copy embed). That is a separate site-token → org map from email tenancy. See [WIDGET.md](./WIDGET.md). Manager console org always comes from the JWT.
