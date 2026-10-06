-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- The helpdesk ticket (e.g. Jira "SUP-12") raised when a conversation is
-- handed to a person. The customer agent looks up only these, by the
-- customer's own conversations, never the whole project.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "external_ticket_key" text;
CREATE INDEX IF NOT EXISTS "conversations_org_external_ticket_idx"
  ON "conversations" ("organization_id", "external_ticket_key")
  WHERE "external_ticket_key" IS NOT NULL;
