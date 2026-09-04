# Deploy to Railway

One GitHub repo (`Ai-Xccelerate/agent-mike`) → two Railway services, Nick’s layout.

Do **not** merge or deploy this work from `main` until staging is proven. Ship from the `staging` branch.

## Services

Project: `agent-mike` (`f9925ea4-a14d-4d6e-9310-bcc6907c2ff4`)

| Service | Root directory | Start | Health |
| --- | --- | --- | --- |
| API (`api`) | repository root | `npx drizzle-kit migrate && npm run start -- -p $PORT` (`railway.toml`) | `/api/health` |
| Web (`web`) | `frontend` | `npm run start -- -H 0.0.0.0 -p $PORT` (`frontend/railway.toml`) | `/api/health` |
| Postgres | Railway plugin | — | — |

The legacy FastAPI app under `apps/api` is not the Railway API root anymore.

## Staging environment (human)

Railway currently has **production** only. Duplicate a **staging** environment on the same project, then:

1. Point both `api` and `web` at the `staging` git branch.
2. Set API root directory to `/` (repo root) and web root directory to `/frontend`.
3. Generate public domains (or attach `mike-staging.aiworkforce.md` / API staging hostname).
4. Copy Clerk + Core env **names** from `.env.example` / `frontend/.env.example` and **values** from the Core kit file. Do not invent secrets.
5. `CLERK_AUTHORIZED_PARTIES` on Mike API must include Core **and** the Mike frontend origin.
6. Ask Core owners to add those Mike URLs to Core CORS and to register catalog slug `mike` when ready.

Until the catalog row exists, signed-in manager traffic returns **503** “not registered”. That is expected.

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
MIKE_WIDGET_SITE_TOKEN=...
MIKE_WIDGET_ORG_ID=org_...
NYLAS_API_KEY=...
NYLAS_API_URI=https://api.us.nylas.com
NYLAS_WEBHOOK_SECRET=...
```

Never set `MIKE_ALLOW_LOCAL_UNAUTH` here. Do not set `NYLAS_ORG_ID` — attach grants in Settings (`PUT /api/v1/mailboxes`) using the signed-in Clerk org.

Nylas inbound webhook (challenge GET + signed POST):

```text
https://YOUR-API-DOMAIN/api/v1/webhooks/nylas
```

Subscribe at least to `message.created`. After Nylas verifies the challenge, store the generated `webhook_secret` as `NYLAS_WEBHOOK_SECRET`.

Grant↔org mapping: see [NYLAS_GRANT_ORG_MAPPING.md](./NYLAS_GRANT_ORG_MAPPING.md). Managers bind grant + email to their JWT org; webhooks resolve org from `grant_id`.
## Web variables

```text
NEXT_PUBLIC_API_URL=https://YOUR-API-DOMAIN
NEXT_PUBLIC_WIDGET_ORIGIN=https://YOUR-WEB-DOMAIN
NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN=...   # same value as API MIKE_WIDGET_SITE_TOKEN
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_ENCRYPTION_KEY=...
CLERK_SIGN_IN_URL=https://app-staging.aiworkforce.md/login
CLERK_SIGN_UP_URL=https://app-staging.aiworkforce.md/signup
CLERK_ALLOWED_REDIRECT_ORIGINS=https://mike-staging.aiworkforce.md
CLERK_AUTHORIZED_PARTIES=https://app-staging.aiworkforce.md,https://mike-staging.aiworkforce.md
NEXT_PUBLIC_CORE_API_URL=https://api-staging.aiworkforce.md
NEXT_PUBLIC_CORE_APP_URL=https://app-staging.aiworkforce.md
```

## Verify

- `https://YOUR-API-DOMAIN/api/health` → `{ "status": "ok", "service": "mike-api" }`
- Open the web domain; unauthenticated users redirect to Core login
- After Core login, if catalog `mike` is missing, the no-access screen / API 503 is expected
- `/widget` stays public and uses the site token
