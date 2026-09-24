-- Hand-written, not drizzle-kit generated: see 0019/0020's own notes on this
-- repo's missing migrations/meta snapshots. `drizzle-kit generate` was run
-- first as instructed and, as expected given that gap, produced a bogus
-- full diff against the stale 0014 snapshot (re-creating nylas_mailboxes and
-- provider_credentials, re-adding columns 0015-0022 already added, dropping
-- an index still in use). This migration keeps only the one statement pair
-- actually intended here.

-- Mike's Clerk identity adapter (lib/identity-clerk.ts) just-in-time
-- provisions a worker_users row per (organizationId, Clerk user id). Nullable
-- and non-unique-per-null: existing rows created before this adapter existed
-- have no Clerk user id and are unaffected.
-- IF NOT EXISTS: this entry's journal timestamp was once lower than 0022's,
-- so some databases recorded it out of order; safe to run again either way.
ALTER TABLE "worker_users" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_users_org_clerk_user_unique"
  ON "worker_users" ("organization_id", "clerk_user_id");
