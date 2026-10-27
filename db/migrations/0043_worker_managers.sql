-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- The people a handover can be routed to, by area, with a backup and an optional Critical group. The single manager
-- on the worker profile stays as the fallback.
CREATE TABLE IF NOT EXISTS "worker_managers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "areas" text DEFAULT '' NOT NULL,
  "backup_id" uuid,
  "notify_on_critical" boolean DEFAULT false NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "worker_managers_org_idx" ON "worker_managers" ("organization_id");

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "routed_manager_id" uuid;
