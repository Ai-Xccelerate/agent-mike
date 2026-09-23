-- Hand-written, not drizzle-kit generated: see 0019/0020's own notes on this
-- repo's missing migrations/meta snapshots.

-- Off-by-default gate for the admin Assistant's Tier 4 "Act" tools.
ALTER TABLE "worker_profiles" ADD COLUMN "assistant_actions_enabled" boolean DEFAULT false NOT NULL;
