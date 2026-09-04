# Deploy to Railway

One GitHub repo (`Ai-Xccelerate/agent-mike`) → two Railway services.

Do **not** merge or deploy this work from `main` until staging is proven. Ship from the `staging` branch.

## Services

Project: `agent-mike` (`f9925ea4-a14d-4d6e-9310-bcc6907c2ff4`)

| Service | Root directory | Start | Health |
| --- | --- | --- | --- |
| `mike-api` | repository root | `npx drizzle-kit migrate && npm run start -- -p $PORT` (`railway.toml`) | `/api/health` |
| `mike-frontend` | `frontend` | Docker / `npm run start` (`frontend/Dockerfile`, `frontend/railway.toml`) | `/api/health` |
| Postgres | Railway plugin | — | — |

The legacy FastAPI app under `apps/api` is not the Railway API root anymore.

## Staging environment

1. Point both services at the `staging` git branch.
2. API root `/`, frontend root `/frontend`.
3. Domains: `mike-staging.aiworkforce.md`, `mike-api-staging.aiworkforce.md` (or Railway URLs).
4. Copy Clerk + Core values from the Core kit — do not invent secrets.
5. `CLERK_AUTHORIZED_PARTIES` on Mike API must include Core **and** the Mike frontend origin.
6. Ask Core owners to add Mike URLs to Core CORS and to register catalog slug `mike` when ready.

## API variables

```text
APP_ENV=staging
DATABASE_URL=${{Postgres.DATABASE_URL}}
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
OPENAI_TRANSCRIBE_LANGUAGE=en
DEMO_MODE=false
CLERK_JWKS_URL=...
CLERK_ISSUER=...
CLERK_AUTHORIZED_PARTIES=https://app-staging.aiworkforce.md,https://mike-staging.aiworkforce.md
AIX_CORE_API_URL=https://api-staging.aiworkforce.md
CORS_ALLOWED_ORIGINS=https://mike-staging.aiworkforce.md,https://app-staging.aiworkforce.md
NYLAS_API_KEY=...
NYLAS_API_URI=https://api.us.nylas.com
NYLAS_WEBHOOK_SECRET=...
NYLAS_GRANT_ID=...
NYLAS_MAILBOX_EMAIL=agent.mike@wkr.email
# Optional legacy widget fallback only — prefer Chat → Copy embed (widget_sites):
# MIKE_WIDGET_SITE_TOKEN=...
# MIKE_WIDGET_ORG_ID=org_...
```

Never set `MIKE_ALLOW_LOCAL_UNAUTH` here. Do not set `NYLAS_ORG_ID`.

Nylas inbound webhook:

```text
https://YOUR-API-DOMAIN/api/v1/webhooks/nylas
```

Subscribe at least to `message.created`. Store `webhook_secret` as `NYLAS_WEBHOOK_SECRET`.

Grant↔org: [NYLAS_GRANT_ORG_MAPPING.md](./NYLAS_GRANT_ORG_MAPPING.md).  
Widget↔org: [WIDGET.md](./WIDGET.md).

## Web variables

```text
NEXT_PUBLIC_API_URL=https://YOUR-API-DOMAIN
NEXT_PUBLIC_WIDGET_ORIGIN=https://YOUR-WEB-DOMAIN
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_ENCRYPTION_KEY=...
CLERK_SIGN_IN_URL=https://app-staging.aiworkforce.md/login
CLERK_SIGN_UP_URL=https://app-staging.aiworkforce.md/signup
CLERK_ALLOWED_REDIRECT_ORIGINS=https://mike-staging.aiworkforce.md
CLERK_AUTHORIZED_PARTIES=https://app-staging.aiworkforce.md,https://mike-staging.aiworkforce.md
NEXT_PUBLIC_CORE_API_URL=https://api-staging.aiworkforce.md
NEXT_PUBLIC_CORE_APP_URL=https://app-staging.aiworkforce.md
# NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN is unused for multi-tenant embeds (?site= in URL).
```

Bake `NEXT_PUBLIC_CLERK_*` into the frontend Docker build args (see `frontend/Dockerfile`).

## Verify

- `https://YOUR-API-DOMAIN/api/health` → `{ "status": "ok", "service": "mike-api" }`
- Manager UI: Core login → Overview / Inbox / Chat / Knowledge / Settings
- Chat → Copy embed → iframe includes `?site=`; widget launcher opens and answers
- Widget thread appears in Inbox for the copying org
- Settings → Integrations: save mailbox email (grant from `NYLAS_GRANT_ID`)
