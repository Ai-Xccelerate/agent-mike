-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Why the worker replied the way it did: what was in play, which pages and checks, how the answer matches its pages.
-- A table of its own, not a column on messages, so it can never ride along with a message sent to a customer.
-- Read only by managers (GET /api/v1/messages/:id/trace).
CREATE TABLE IF NOT EXISTS "reply_traces" (
  "message_id" uuid PRIMARY KEY NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "trace" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "reply_traces_org_idx" ON "reply_traces" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "reply_traces_conversation_idx" ON "reply_traces" ("conversation_id");
