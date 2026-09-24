-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Which interactive panels (skills, knowledge, integrations, ...) an admin
-- Assistant reply displayed. Kinds only; panel data is read live.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "panels" jsonb DEFAULT '[]'::jsonb NOT NULL;
