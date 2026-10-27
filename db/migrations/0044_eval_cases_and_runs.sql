-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Saved test cases made from review items, and the scored replays of them. Per organization; personal details are
-- removed before a case is saved.
CREATE TABLE IF NOT EXISTS "eval_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "reference" text,
  "expect_handover" boolean,
  "source_item" text,
  "source_kind" text DEFAULT 'manual' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "eval_cases_org_idx" ON "eval_cases" ("organization_id");

CREATE TABLE IF NOT EXISTS "eval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'running' NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "passed" integer DEFAULT 0 NOT NULL,
  "score" real,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "results" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "change_id" uuid,
  "error" text,
  "triggered_by" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "eval_runs_org_idx" ON "eval_runs" ("organization_id", "started_at");
