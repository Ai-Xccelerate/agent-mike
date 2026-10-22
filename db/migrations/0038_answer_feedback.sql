-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- A manager's rating of one of the worker's replies: good or bad, why, and what it should have said.
-- One rating per person per reply. `context` is what the worker was running when it wrote the reply, so a
-- bad rating can be traced to a setting change.
CREATE TABLE IF NOT EXISTS "answer_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "rating" text NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "correction" text,
  "rated_by" text NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "answer_feedback_message_rater_unique" ON "answer_feedback" ("message_id", "rated_by");
CREATE INDEX IF NOT EXISTS "answer_feedback_org_idx" ON "answer_feedback" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "answer_feedback_conversation_idx" ON "answer_feedback" ("conversation_id");
