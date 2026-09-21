# Deploy Agent Mike on Railway

Railway project: `agent-mike` (`f9925ea4-a14d-4d6e-9310-bcc6907c2ff4`).

- `mike-api` uses repository root and `railway.toml`.
- `mike-frontend` uses root directory `frontend` and
  `frontend/railway.toml`.
- Postgres remains Mike's existing Railway database.

Do not point either service at the Foundation repositories or the `AIX worker`
Railway project.

## Preview before cutover

1. Push the migration branch to `agent-mike`.
2. Create isolated preview API, frontend, and Postgres services. Do not attach
   the live Mike Postgres volume.
3. Apply [the staging variable templates](./RAILWAY_STAGING_VARS.md).
4. Register preview frontend origins with Clerk and AIX Core.
5. Snapshot/restore representative Mike data into preview.
6. Let `mike-api` run `npx drizzle-kit migrate` on preview startup.
7. Complete the checks in [MIGRATION.md](./MIGRATION.md).

## Live cutover

Only after explicit approval:

1. Take a restorable snapshot of live Mike Postgres.
2. Confirm both services still target Mike's `staging` branch and correct root
   directories.
3. Merge the migration branch into Mike `staging`.
4. Watch the API migration/deploy first, then frontend.
5. Verify:
   - `/api/health` returns `{"status":"ok","service":"mike-api"}`;
   - Clerk login and Core access;
   - dashboard, chat, widget, Inbox, Knowledge, Settings;
   - Nylas and Composio integrations.

The backend start command migrates before serving:

```text
npx drizzle-kit migrate && npm run start -- -H 0.0.0.0 -p $PORT
```

## Nylas URLs

- callback: `https://YOUR-API-DOMAIN/api/v1/mailbox/callback`
- webhook: `https://YOUR-API-DOMAIN/api/v1/webhooks/nylas`
- subscribe webhook to `message.created`

Never set `MIKE_ALLOW_LOCAL_UNAUTH` on Railway.
