# Agent Mike

Agent Mike is a deployable Level 1 support agent with a first-class identity, an AgentMail inbox, a web chat widget, manager oversight, and an OKF-compatible knowledge base. Claude Agent SDK is the agent harness; FastAPI runs the agent and channel workflows; PostgreSQL stores conversations and ranks knowledge; Next.js provides the manager console and widget.

The manager console is adapted from the MIT-licensed [Ai-Xccelerate/aix-ui-template](https://github.com/Ai-Xccelerate/aix-ui-template). See the [template usage map](docs/TEMPLATE_USAGE.md) for the exact components, conventions, and update boundary.

## What is included

- A polished support operations console: overview, inbox, live chat, knowledge, and settings.
- An embeddable customer chat widget at `/widget`.
- A safe Claude Agent SDK runtime with no filesystem or shell tools exposed.
- AgentMail inbound webhook and outbound reply adapter.
- OKF v0.1 markdown ingestion with YAML frontmatter and PostgreSQL full-text retrieval.
- Manager escalation, confidence thresholds, citations, audit metadata, and configurable guardrails.
- Demo mode so the whole product can be explored without paid API keys.
- Docker and Railway-ready service configuration.

## Architecture

```text
Customer email ── AgentMail webhook ─┐
                                    ├── FastAPI ── Claude Agent SDK
Website widget ── chat REST API ─────┘      │          │
                                            │          └── Anthropic API
Manager console ────────────────────────────┤
                                            └── PostgreSQL
                                                conversations, messages,
OKF markdown bundle ── ingestion API ────────── knowledge + search index
```

## Quick start

The easiest full-stack start is Docker:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. Demo mode is enabled by default. To run with Claude, set `ANTHROPIC_API_KEY` and `DEMO_MODE=false` on the API service.

For a local developer loop without Docker:

```bash
docker compose up -d postgres
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd apps/web
npm install
npm run dev
```

The API is at `http://localhost:8000`; interactive API docs are at `/docs`.

## Configure Mike

1. Open **Settings → Identity** and set Mike's public name, email, tone, and avatar initials.
2. Under **Role**, define the supported products and what Level 1 means for your team.
3. Under **Guardrails**, set the confidence threshold and escalation triggers.
4. Add OKF documents under `knowledge/` (they are ingested on API startup) or upload a `.md` file from **Knowledge**.
5. Add AgentMail and Anthropic credentials to the API environment.

See [Product and template guide](docs/PRODUCT_GUIDE.md), [architecture](docs/ARCHITECTURE.md), and [Railway deployment](docs/DEPLOY_RAILWAY.md) for the operating model and production setup.
