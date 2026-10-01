-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Rich cards (ticket lists, a ticket, knowledge results, configuration,
-- audit findings, drafts, panels) an admin Assistant reply showed, so a
-- reloaded chat shows the same cards. See lib/assistant-cards.ts.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "cards" jsonb DEFAULT '[]'::jsonb NOT NULL;
