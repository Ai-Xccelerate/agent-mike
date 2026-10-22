-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- What the website widget opens with. Null keeps the built-in greeting and
-- quick actions, so no existing worker changes.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "welcome_message" text;
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "quick_actions" jsonb;
