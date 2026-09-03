# Architecture

## Service boundaries

`frontend/` is a Next.js manager console and public `/widget`. It never receives Anthropic or AgentMail secrets. Manager routes require the shared AIX Clerk session; `/widget` is public and authenticates to the API with a site token.

The API is a Next.js app at the repository root. It owns identity configuration, org-scoped conversations, messages, guardrails, knowledge ingestion/retrieval, Claude execution, and AgentMail delivery. Clerk JWTs are verified locally; every manager request then checks `GET /api/v1/agents/mike/access` on AIX Core.

The legacy FastAPI app under `apps/api` is not the Railway root anymore.

PostgreSQL is the durable system of record. OKF files remain the portable, human-reviewable knowledge source. Ingestion copies their frontmatter and body into PostgreSQL, then splits the body into searchable chunks.

## Request lifecycle

1. A message arrives from the widget or the AgentMail webhook.
2. The API persists the customer message and retrieves relevant knowledge chunks using PostgreSQL full-text search.
3. Deterministic rules check for escalation terms, prompt-injection language, and configured risk boundaries.
4. If safe to proceed, the API builds Mike's system prompt and runs a single Anthropic Messages turn with no tools.
5. The answer and citations are persisted. Email answers are sent through AgentMail; chat answers are returned to the widget.
6. Low-confidence or guarded requests are marked `needs_human` and appear in the manager inbox.

## Why full-text search first

PostgreSQL `websearch_to_tsquery` gives a low-operations baseline: no extra database extension, embedding provider, or synchronization system. It works particularly well for product names, error codes, plan names, and exact support terminology. Add hybrid vector search later when the corpus becomes large or questions are highly paraphrased.

## Security boundaries

- Anthropic calls run with no tools, so the support agent cannot use shell, filesystem, or code-editing tools.
- Retrieved text is marked as untrusted reference material in the prompt.
- Secrets stay server-side and are never serialized by API schemas.
- AgentMail webhook verification is supported with HMAC SHA-256.
- The public chat endpoint should receive rate limiting and bot protection at the edge before a high-volume launch.
- Manager routes require Clerk + Core access. Widget chat uses `x-mike-site-token`. The AgentMail webhook uses a Svix signing secret. The local Clerk bypass is fail-closed outside `APP_ENV=local`.

