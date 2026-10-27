-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Changes the Assistant applied after a manager confirmed them, with the text before and after, so they can be undone.
CREATE TABLE IF NOT EXISTS "change_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tool_id" text NOT NULL,
  "summary" text NOT NULL,
  "applied_by" text NOT NULL,
  "diff" jsonb NOT NULL,
  "reverted_at" timestamp with time zone,
  "reverted_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "change_log_org_idx" ON "change_log" ("organization_id", "created_at");
