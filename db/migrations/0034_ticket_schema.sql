-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Each worker's own ticket vocabulary: the request types, tiers and labels it
-- may classify a conversation with. Null = the built-in defaults.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "ticket_schema" jsonb;

-- Who set a conversation's classification: "worker" (the classifier, which may
-- redo it) or "manual" (a person edited it, so the classifier leaves it alone).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "classification_source" text;
