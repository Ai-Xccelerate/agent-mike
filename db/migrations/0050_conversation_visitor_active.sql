-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- When the website chat visitor was last seen typing (lib/idle-check-in.ts). The idle check-in's minute sweep reads
-- it, so a visitor writing a long reply is not taken for one who closed the tab.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "visitor_active_at" timestamp with time zone;
