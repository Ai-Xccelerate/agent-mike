# Staging Railway variables — copy/paste

You cannot put real Clerk/Anthropic/Nylas **secrets** in git. Railway reads variables from the service UI, not from a committed `.env`.

What *is* in the repo (safe to copy):

- API paste block: [`.env.staging.example`](../.env.staging.example)
- Frontend paste block: [`frontend/.env.staging.example`](../frontend/.env.staging.example)

## Where the secret values come from

| Variable | Copy from |
|---|---|
| `CLERK_JWKS_URL`, `CLERK_ISSUER` | Core kit `aix-clerk-core-env-values.md` **or** Jules/Nick **API** staging Railway |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Same kit **or** Jules/Nick **frontend** staging Railway |
| `CLERK_ENCRYPTION_KEY` | Jules/Nick frontend staging, or generate once |
| `OPENAI_API_KEY` | OpenAI dashboard (Agents SDK / Responses) |
| `OPENAI_MODEL` | Default `gpt-5.6-luna`; optional `gpt-5.6-sol` |
| `OPENAI_TRANSCRIBE_MODEL` | Default `gpt-transcribe` (Chat mic STT) |
| `OPENAI_TRANSCRIBE_LANGUAGE` | Default `en` |
| `NYLAS_API_KEY`, `NYLAS_WEBHOOK_SECRET` | Nylas dashboard (app API key + webhook secret) |
| `NYLAS_GRANT_ID` | Nylas grant UUID for this Mike deploy (not shown in Settings UI) |
| `NYLAS_MAILBOX_EMAIL` | Optional default mailbox email (e.g. `agent.mike@wkr.email`) |
| `DATABASE_URL` | Already in the paste file as `${{Postgres.DATABASE_URL}}` |
| `MIKE_WIDGET_SITE_TOKEN` / `MIKE_WIDGET_ORG_ID` | **Deprecated for multi-tenant.** Optional legacy fallback only. Prefer per-org tokens in `widget_sites` (Chat → Copy embed). |

Do **not** set `NYLAS_ORG_ID`. Set `NYLAS_GRANT_ID` on `mike-api`; managers only confirm mailbox email in Settings.

Remove any leftover `AGENTMAIL_*` variables from `mike-api` after cutover.

## Paste into Railway

1. `mike-api` → **Variables** → Raw Editor → paste `.env.staging.example` → fill blanks.
2. Generate a public domain on `mike-api`.
3. `mike-frontend` → **Variables** → Raw Editor → paste `frontend/.env.staging.example`.
4. Generate a public domain on `mike-frontend`.
5. Put that frontend origin into:
   - API `CLERK_AUTHORIZED_PARTIES` and `CORS_ALLOWED_ORIGINS`
   - Frontend `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WIDGET_ORIGIN`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_AUTHORIZED_PARTIES`
6. Register Nylas webhook → `https://YOUR-API-DOMAIN/api/v1/webhooks/nylas` (`message.created`) and save `webhook_secret`.
7. Then Apply / Deploy.

Never set `MIKE_ALLOW_LOCAL_UNAUTH` on Railway.
