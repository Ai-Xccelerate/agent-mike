-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Approved wording a manager keeps for situations that come up again and again. The worker is told to use it,
-- in her own words around the facts, when the situation matches. One row per reply, per organization.
CREATE TABLE IF NOT EXISTS "canned_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "situation" text NOT NULL,
  "reply" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "canned_replies_org_idx" ON "canned_replies" ("organization_id");
