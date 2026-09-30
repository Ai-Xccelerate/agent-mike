-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Email channel: an inbound email thread maps to one conversation, and each
-- email maps to at most one message (Nylas retries webhooks, so the unique
-- index is what makes a retried delivery a no-op instead of a second reply).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "external_thread_id" text;
CREATE INDEX IF NOT EXISTS "conversations_org_external_thread_idx"
  ON "conversations" ("organization_id", "external_thread_id");

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "external_message_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "messages_external_message_id_unique"
  ON "messages" ("external_message_id") WHERE "external_message_id" IS NOT NULL;

-- Settings > Email domains becomes optional: off (the default) lets the
-- worker email any domain; on keeps the approved-domains-only rule.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "restrict_email_domains" boolean DEFAULT false NOT NULL;

-- A Nylas grant belongs to exactly one organization. Inbound webhooks carry
-- no session and are routed by grant id alone, so two orgs sharing a grant
-- would receive each other's mail.
CREATE UNIQUE INDEX IF NOT EXISTS "nylas_mailboxes_grant_unique" ON "nylas_mailboxes" ("grant_id");
