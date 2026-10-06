-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Why the helpdesk refused the last handoff ticket, shown in the Inbox.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "external_ticket_error" text;

-- A connection's own settings, kept apart from integration_connections so a
-- disconnect (which deletes that row) doesn't wipe them.
CREATE TABLE IF NOT EXISTS "integration_settings" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "integration_type" text NOT NULL,
  "system" text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "integration_type")
);

-- Keep what's already been set on existing connections.
INSERT INTO "integration_settings" ("organization_id", "integration_type", "system", "settings")
SELECT "organization_id", "integration_type", "system", "metadata"->'settings'
FROM "integration_connections"
WHERE "metadata" ? 'settings'
ON CONFLICT DO NOTHING;
