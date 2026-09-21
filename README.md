# Agent Mike

Agent Mike runs the AI Worker Foundation in Mike's existing repository and
Railway deployment. It preserves Mike's Clerk + AIX Core access contract,
database data, widget/Nylas behavior, and `AIX` ticket identity.

## What's here

- repository root: Mike API (Next.js, OpenAI Agents SDK, Drizzle/Postgres)
- `frontend/`: manager UI and public widget
- `db/migrations/`: Mike's deployed lineage plus the Foundation migration
- `docs/MIGRATION.md`: preserved contracts and cutover gate
- `docs/DEPLOY_RAILWAY.md`: Mike Railway deployment

## Quick start

```bash
docker compose up -d postgres
cp .env.example .env.local

npm install
npx drizzle-kit migrate
npm run dev

cd frontend
npm install
npm run dev
```

API runs at `http://localhost:3000`; frontend at `http://localhost:3001`.
`DEMO_MODE=true` skips live model calls locally. Railway always requires Clerk
and AIX Core access.
