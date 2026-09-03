# Agent Mike

Agent Mike is a deployable Level 1 support agent with a manager console, embeddable widget, knowledge retrieval, human escalation, and AgentMail. The API is Next.js + Drizzle at the repository root. The manager UI lives in `frontend/`. Auth is the shared AIX Clerk app plus Core `/access` for slug `mike`.

The manager console is adapted from the MIT-licensed [Ai-Xccelerate/aix-ui-template](https://github.com/Ai-Xccelerate/aix-ui-template). See the [template usage map](docs/TEMPLATE_USAGE.md) for the exact components, conventions, and update boundary.

## Architecture

```text
Clerk (AIX Core) ── frontend (ClerkProvider, except /widget)
                         │ rewrites /api/v1/*
                         ▼
Website widget ── x-mike-site-token ── Next.js API ── Anthropic
Customer email ── AgentMail webhook ──┘      │
Manager console ── Bearer JWT ───────────────┤
                                             └── PostgreSQL (org-scoped)
```

See [Core integration](docs/CORE_INTEGRATION.md) and [Railway deployment](docs/DEPLOY_RAILWAY.md).

## Quick start

```bash
docker compose up -d postgres
cp .env.example .env.local
# Fill Clerk/Core values from the AIX Core kit. For local-only API work:
# APP_ENV=local and MIKE_ALLOW_LOCAL_UNAUTH=true (never on Railway)

npm install
npx drizzle-kit migrate
npm run dev
```

In another terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

API: `http://localhost:3000`  
Manager UI: `http://localhost:3001`  
Widget: `http://localhost:3001/widget`

`DEMO_MODE=true` skips live Claude and AgentMail sends. It is not an auth bypass.

## Configure Mike

1. Open **Settings** after signing in through AIX Core (or local bypass).
2. Set identity, role, guardrails, and the human manager.
3. Upload OKF markdown (or PDF/txt) on **Knowledge**.
4. Add AgentMail and Anthropic credentials on the API service.

Catalog registration for slug `mike` is owned by another engineer. Until that row exists, authenticated API calls return 503 “not registered”.
