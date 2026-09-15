-- The worker's own mailbox and calendar, connected through Nylas.
--
-- Identity, not a delegated business-system connection: this is the address
-- the agent sends *from*, not an account it borrows. It therefore gets its own
-- table rather than a row in `integration_connections`, which models "this org
-- connected someone else's system via Composio".
--
-- One row per org, because one worker per org (worker_profiles_org_unique)
-- means one identity means one mailbox.
--
-- Only the grant id is stored. Hosted OAuth with access_type=online leaves the
-- refresh token with Nylas, so there is no access token here to rotate or leak.

CREATE TABLE IF NOT EXISTS "nylas_mailboxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "grant_id" text NOT NULL,
  "email" text NOT NULL,
  "provider" text,
  -- connected | invalid | disconnected. `invalid` keeps a revoked grant visible
  -- so the screen can say "reconnect" instead of silently forgetting it.
  "status" text DEFAULT 'connected' NOT NULL,
  "connected_by" text,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nylas_mailboxes_org_unique"
  ON "nylas_mailboxes" ("organization_id");
