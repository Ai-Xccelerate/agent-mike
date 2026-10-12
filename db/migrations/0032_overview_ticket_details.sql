-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- The Overview counts the worker's tickets by request type and priority, so
-- both are kept with the ticket key when the ticket is raised.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "external_ticket_type" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "external_ticket_priority" text;

-- The team's first-reply target in hours (e.g. 4), shown on the Overview.
-- Null = no target set.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "first_reply_target_hours" integer;
