# AI-worker-backend

The API for AI Xccelerate's AI Worker Foundation — Next.js (route handlers) +
Drizzle ORM + PostgreSQL, with the [OpenAI Agents SDK](https://github.com/openai/openai-agents-js)
as the harness. Built fresh — see `docs/ARCHITECTURE.md` for why, and how
identity/access is kept decoupled from the base template.

## What's here

- `app/api/v1/` — worker profile (identity/role/guardrails/manager/agent
  config), chat, conversations, knowledge, widget site tokens, users
- `lib/` — harness (`agent.ts`), identity adapter (`identity.ts`), guardrails,
  knowledge ingestion + retrieval
- `db/` — Drizzle schema (Postgres)
- `knowledge/` — starter OKF markdown bundle, ingested on demand

## Quick start

```bash
docker compose up -d postgres
cp .env.example .env.local

npm install
npx drizzle-kit migrate
npm run dev
```

API runs at `http://localhost:3000`. `DEMO_MODE=true` (the default in
`.env.example`) skips live OpenAI calls and returns a canned response — no
API key required to run the whole stack locally.

## Known gaps

Domain/user verification as a callable pattern, a skills library, a
generalized business-system integration pattern, and voice are all still
open — see `docs/ARCHITECTURE.md` → "Deliberately not built yet."
