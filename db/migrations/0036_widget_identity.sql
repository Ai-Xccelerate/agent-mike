-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Who a widget visitor is. The email is only trusted for ticket lookups and
-- Jira customer creation once a code sent to it has been typed back.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "customer_email_verified_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "identity_source" text;

-- off | email_match | email_code. Off keeps today's behaviour for every existing worker.
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "identity_mode" text DEFAULT 'off' NOT NULL;

-- One row per code sent. Only a hash of the code is kept. The rows double as the
-- record the rate limits count (per conversation, email, IP and organization).
CREATE TABLE IF NOT EXISTS "email_verification_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "ip" text,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_verification_codes_email_idx" ON "email_verification_codes" ("email", "created_at");
CREATE INDEX IF NOT EXISTS "email_verification_codes_ip_idx" ON "email_verification_codes" ("ip", "created_at");
CREATE INDEX IF NOT EXISTS "email_verification_codes_conversation_idx" ON "email_verification_codes" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "email_verification_codes_org_idx" ON "email_verification_codes" ("organization_id", "created_at");
