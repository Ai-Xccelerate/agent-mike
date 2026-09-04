# Architecture

## Service boundaries

`frontend/` is a Next.js manager console and public `/widget`. It never receives OpenAI or Nylas secrets. Manager routes require the shared AIX Clerk session; `/widget` is public and authenticates to the API with a **per-org** site token (`widget_sites`).

The API is a Next.js app at the repository root. It owns identity configuration, org-scoped conversations, messages, guardrails, knowledge ingestion/retrieval, OpenAI Agents SDK execution, Whisper/`gpt-transcribe` STT, and Nylas delivery. Clerk JWTs are verified locally; every manager request then checks `GET /api/v1/agents/mike/access` on AIX Core.

The legacy FastAPI app under `apps/api` is not the Railway root anymore.

PostgreSQL is the durable system of record. OKF files remain the portable, human-reviewable knowledge source. Ingestion copies their frontmatter and body into PostgreSQL, then splits the body into searchable chunks.

## Tenancy

| Channel | Tenant resolution |
|---|---|
| Manager console | Clerk JWT `org_id` |
| Website widget | `x-mike-site-token` → `widget_sites.organization_id` (see [WIDGET.md](./WIDGET.md)) |
| Nylas email | Webhook `grant_id` → `nylas_mailboxes.organization_id` (see [NYLAS_GRANT_ORG_MAPPING.md](./NYLAS_GRANT_ORG_MAPPING.md)) |

All conversations, messages, knowledge, and profile rows are filtered by `organization_id`.

## Request lifecycle

1. A message arrives from the widget or the Nylas webhook.
2. The API persists the customer message and retrieves relevant knowledge chunks using PostgreSQL full-text search.
3. Deterministic rules check for escalation terms, prompt-injection language, and configured risk boundaries.
4. If safe to proceed, the API builds Mike's instructions and runs a single OpenAI Agents SDK turn (`gpt-5.6-luna` by default) with no tools.
5. The answer and citations are persisted. Email answers are sent through Nylas; chat answers are returned to the widget.
6. Low-confidence or guarded requests are marked `needs_human` and appear in the manager inbox.

## Why full-text search first

PostgreSQL `websearch_to_tsquery` gives a low-operations baseline: no extra database extension, embedding provider, or synchronization system. It works particularly well for product names, error codes, plan names, and exact support terminology. Add hybrid vector search later when the corpus becomes large or questions are highly paraphrased.

## Security boundaries

- OpenAI Agents SDK calls run with no tools, so the support agent cannot use shell, filesystem, or code-editing tools.
- Retrieved text is marked as untrusted reference material in the prompt.
- Secrets stay server-side and are never serialized by API schemas (Nylas grant ids are not shown in Settings).
- Nylas webhook verification uses HMAC-SHA256 over the raw body (`x-nylas-signature`) plus a GET challenge handshake.
- The public chat endpoint should receive rate limiting and bot protection at the edge before a high-volume launch.
- Manager routes require Clerk + Core access. Widget chat uses per-org `x-mike-site-token`. The Nylas webhook uses `NYLAS_WEBHOOK_SECRET`. The local Clerk bypass is fail-closed outside `APP_ENV=local`.
