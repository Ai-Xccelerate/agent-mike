# Deploy to Railway

This repository is an isolated monorepo: the web and API services have separate roots and do not import shared code. Create one Railway project with three services.

## Current deployment

Deployed in the AI Xccelerate Railway workspace:

- Project: `agent-mike` (`f9925ea4-a14d-4d6e-9310-bcc6907c2ff4`)
- Console and widget: `https://web-production-13a30.up.railway.app`
- API: `https://api-production-491c.up.railway.app`
- Environment: `production`
- Services: `web`, `api`, and `Postgres`

Running with `DEMO_MODE=false` and `CLAUDE_MODEL=claude-sonnet-5`. The database
starts empty (no seeded conversations or knowledge). Until approved knowledge is
loaded from the **Knowledge** page, every question retrieves zero chunks, scores
below the confidence threshold, and escalates to a human before Claude is called —
this is expected, not a failure. AgentMail does not send external traffic until
its secrets are set.

Services build from their own Dockerfiles. Each is deployed by running
`railway up --service <name>` from inside its app directory (`apps/api`,
`apps/web`) so the Dockerfile sits at the build-context root — `source.rootDirectory`
was intentionally left unset. Both services listen on Railway's injected `PORT`
(8080), so their generated domains target port 8080.

The earlier demo project `eap-mike` (`5b472646-e9e7-4698-93a7-f9b232e12abe`,
`DEMO_MODE=true`) still exists in the same workspace.

## 1. Create services

1. Add a PostgreSQL database.
2. Add an empty service named `api` with root directory `/apps/api`.
3. Add an empty service named `web` with root directory `/apps/web`.

Both app directories include a Dockerfile. Railway can also detect Python and Next.js automatically, but Dockerfiles make the runtime commands explicit.

## 2. API variables

Set these on `api`:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-5
AGENTMAIL_API_KEY=...
AGENTMAIL_INBOX_ID=mike@your-domain.example
AGENTMAIL_WEBHOOK_SECRET=...
DEMO_MODE=false
CORS_ORIGINS=https://YOUR-WEB-DOMAIN
```

Railway's Postgres URL starts with `postgresql://`; the API normalizes it to the `postgresql+asyncpg://` SQLAlchemy driver automatically.

Generate a public domain for `api`. Configure AgentMail's inbound webhook to:

```text
https://YOUR-API-DOMAIN/api/v1/webhooks/agentmail
```

## 3. Web variables

Set these on `web` before its build:

```text
NEXT_PUBLIC_API_URL=https://YOUR-API-DOMAIN
NEXT_PUBLIC_WIDGET_ORIGIN=https://YOUR-WEB-DOMAIN
```

Generate a public domain for `web`, then update `CORS_ORIGINS` on the API to the exact web origin.

## 4. Load knowledge

The repository includes a starter OKF bundle in `/knowledge`. Because the API service root is `/apps/api`, that folder is not in the deploy image. For production use one of these patterns:

- Upload documents from the Knowledge page after deploy.
- Trigger `POST /api/v1/knowledge/ingest` from a CI job that checks out the whole repository and sends each document.
- Change the API service to use repository root and Dockerfile path `/apps/api/Dockerfile` if you want the starter bundle baked into the image.

## 5. Verify

Check `https://YOUR-API-DOMAIN/health`; it should return `{"status":"ok"}`. Then open the web domain, send a test chat, and send an email to Mike's AgentMail address. Confirm the thread and its knowledge citations appear in Inbox.

## Production checklist

- Put manager routes behind SSO.
- Turn off demo mode.
- Set a non-empty webhook secret and verify AgentMail's exact signature header format.
- Add edge rate limiting to public chat and webhook endpoints.
- Configure database backups and a staging environment.
- Add telemetry and alerts for failed agent runs and email delivery.
- Review escalation and confidence settings with the support lead before enabling automatic replies.
