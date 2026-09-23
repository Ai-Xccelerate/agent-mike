# Railway staging variables

Use the safe paste templates:

- API: [`.env.staging.example`](../.env.staging.example)
- frontend: [`frontend/.env.staging.example`](../frontend/.env.staging.example)

Secrets stay in Railway variables and must never be committed.

## Variable ownership

`mike-api`:

- Postgres: `DATABASE_URL`
- OpenAI: `OPENAI_API_KEY`
- Clerk verification: `CLERK_JWKS_URL`, `CLERK_ISSUER`,
  `CLERK_AUTHORIZED_PARTIES`
- Core entitlement: `AIX_CORE_API_URL`, `AIX_CORE_AGENT_SLUG=mike`
- Composio: `COMPOSIO_API_KEY` and each
  `COMPOSIO_*_AUTH_CONFIG_ID`
- Nylas: client/API/callback/state variables (`NYLAS_WEBHOOK_SECRET` is
  reserved for future Foundation webhook support)
- provider encryption: `ENCRYPTION_KEY`
- optional Foundation integration credentials

`mike-frontend`:

- `NEXT_PUBLIC_API_URL`
- shared Clerk publishable/secret keys and sign-in URLs
- Core API/app URLs
- allowed redirect origins

## Composio auth-config mapping

- Gmail: `COMPOSIO_GMAIL_AUTH_CONFIG_ID`
- Google Calendar: `COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID`
- Outlook: `COMPOSIO_OUTLOOK_AUTH_CONFIG_ID`
- Linear: `COMPOSIO_LINEAR_AUTH_CONFIG_ID`
- Jira: `COMPOSIO_JIRA_AUTH_CONFIG_ID`
- Zoho: `COMPOSIO_ZOHO_AUTH_CONFIG_ID`

Copy IDs exactly from the Composio dashboard. The API key and config IDs are
server-only.

## Never set on Railway

- `MIKE_ALLOW_LOCAL_UNAUTH`
- `MULTI_AGENT`
- `DEMO_MODE=true`

**As of the AI Worker Foundation v2 migration, `MIKE_PLATFORM_AUTH=true` is
required on Railway.** `middleware.ts` still requires Clerk + Core
automatically on any deployed (Railway/staging/production) environment, but
`lib/identity.ts`'s `defaultAdapter()` now switches on `MIKE_PLATFORM_AUTH`
alone rather than auto-detecting the deployed environment — leaving it unset
would authenticate every request correctly and then still resolve every org
to the single "default" tenant.

## Cross-service values

After preview domains exist:

1. Add the frontend origin to API `CORS_ALLOWED_ORIGINS` and
   `CLERK_AUTHORIZED_PARTIES`.
2. Set frontend `NEXT_PUBLIC_API_URL` to the API domain.
3. Add the frontend origin to Clerk redirect origins.
4. Register Mike's frontend/API URLs and catalog slug `mike` in AIX Core.
5. Register the Nylas callback URL against the API domain.
