-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- The Tickets page groups conversations by request type and tier, and tags
-- them with labels. All three are the worker's own classification, so they
-- exist for customers with no helpdesk. With a helpdesk connected, the
-- request type shown is still the helpdesk's (external_ticket_type) unless
-- this one is set.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "request_type" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "tier" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;
