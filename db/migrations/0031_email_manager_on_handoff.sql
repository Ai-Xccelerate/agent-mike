-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Settings > Human manager: email the manager when the worker hands a
-- conversation over. On by default, which is what already happened for email
-- conversations; it only sends once a manager email and a mailbox are set.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "email_manager_on_handoff" boolean DEFAULT true NOT NULL;
