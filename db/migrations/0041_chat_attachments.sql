-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Files a customer attaches in the website chat, passed to the team. The worker never reads them.
-- Held in the database at first (no new infrastructure at current volume) and deleted when they expire.
-- A file starts unlinked (conversation_id and message_id null, expires in an hour) and is linked to the customer's
-- message when it is sent, then kept for 30 days. Off for every worker until a manager switches it on.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "chat_attachments" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "data" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "message_attachments_org_idx" ON "message_attachments" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "message_attachments_conversation_idx" ON "message_attachments" ("conversation_id");
CREATE INDEX IF NOT EXISTS "message_attachments_expires_idx" ON "message_attachments" ("expires_at");
