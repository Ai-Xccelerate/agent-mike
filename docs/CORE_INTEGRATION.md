# Core integration contract for Agent Mike

Catalog slug: `mike` (must match `GET /api/v1/agents/mike/access`).

This repository does **not** register Mike in the AIX Core catalog. Another engineer owns that row. Until it exists, authenticated manager API calls correctly return **503** with “not registered in the AIX Core catalog”. That is expected, not a bug.

## Auth flow

1. Manager UI uses the shared Clerk app. There is no local login page.
2. Unauthenticated users are sent to Core (`CLERK_SIGN_IN_URL` / `CLERK_SIGN_UP_URL`).
3. The frontend sends the Clerk session JWT as `Authorization: Bearer`.
4. The API verifies the JWT via JWKS + issuer + `azp` (`CLERK_AUTHORIZED_PARTIES` must include the Core origin **and** the Mike frontend origin).
5. The API calls `GET {AIX_CORE_API_URL}/api/v1/agents/mike/access` with that JWT.
   - 401 → 401
   - 404 / unknown agent → **503** (catalog missing)
   - Core down / 5xx → **503** fail closed
   - `has_access: false` → 403 `{ error: "no_agent_access", reason }`
   - Access results are cached for at most 60 seconds
6. After access passes, the API JIT-mirrors `users`, `organizations`, and `organization_memberships` using Clerk IDs as primary keys. There is no local entitlements table and no Clerk webhooks.

## Widget and email

These channels cannot use Clerk.

- Widget: `x-mike-site-token` must match a row in `widget_sites` (created when a manager copies the embed for their JWT org). Embed URL is `/widget?site=<token>`. Optional legacy env `MIKE_WIDGET_SITE_TOKEN` + `MIKE_WIDGET_ORG_ID` remains for local/single-tenant only. See [WIDGET.md](./WIDGET.md).
- Nylas webhook: HMAC-SHA256 via `NYLAS_WEBHOOK_SECRET` (`x-nylas-signature`). Inbound threads resolve `grant_id` → org via `nylas_mailboxes`. Managers bind mailbox email in Settings; grant UUID comes from API env `NYLAS_GRANT_ID`. Endpoint: `GET/POST /api/v1/webhooks/nylas`. See [NYLAS_GRANT_ORG_MAPPING.md](./NYLAS_GRANT_ORG_MAPPING.md).

## Local bypass

`MIKE_ALLOW_LOCAL_UNAUTH=true` is allowed only when **all** of these are true:

- `APP_ENV=local`
- `NODE_ENV` is not `production`
- `RAILWAY_ENVIRONMENT` is unset
- request host is `localhost` or `127.0.0.1`

If the flag is set in staging, production, or any Railway environment, the process throws at boot/request. Do not use `DEMO_MODE` as auth.

## Human follow-up (not done in this repo)

- Register catalog slug `mike` and enable it for orgs (other engineer / Deepak)
- Add Mike staging/production origins to Core CORS and to `CLERK_AUTHORIZED_PARTIES` on Core
- Duplicate a Railway **staging** environment; point both services at the `staging` branch
- API root directory = repository root; web root directory = `frontend`
- Custom domains, for example `mike-staging.aiworkforce.md`
- Copy Clerk/Core env **values** from the Core kit file into Railway — never into git
