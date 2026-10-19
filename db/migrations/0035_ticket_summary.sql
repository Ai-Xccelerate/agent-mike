-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- A short "what this ticket is about" for the person who picks it up. Written
-- by the ticket classifier. Separate from "summary", which is the rolling
-- memory the worker itself reads and only exists once a thread is long.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ticket_summary" text;
