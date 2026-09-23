-- Email domain approval.
--
-- An allow-list of the domains this worker may share activity with. It gets a
-- table rather than a jsonb slice on `worker_profiles` — unlike an integration
-- toggle, each domain carries its own state, justification and decision
-- history, and the list is queried by status and joined on rather than read
-- whole.
--
-- A decision never deletes the row: revoking sets `status = 'revoked'` so the
-- record of what was allowed, and when, survives, and re-approving is one
-- click. The unique index is what makes that safe — one row per domain per
-- org, so the same domain can never be approved and revoked at the same time.

CREATE TABLE IF NOT EXISTS "email_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "reason" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by" text DEFAULT 'manager' NOT NULL,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_domains_org_domain_unique"
  ON "email_domains" ("organization_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_domains_org_status_idx"
  ON "email_domains" ("organization_id", "status");
--> statement-breakpoint
-- One allow-list: copy any JSON allowed_domains into approved rows so
-- guardrails can read this table instead of a second list on the profile.
INSERT INTO "email_domains" ("organization_id", "domain", "status", "requested_by")
SELECT p."organization_id", lower(d.domain), 'approved', 'manager'
  FROM "worker_profiles" p
  CROSS JOIN LATERAL jsonb_array_elements_text(p."allowed_domains") AS d(domain)
 WHERE btrim(d.domain) <> ''
ON CONFLICT ("organization_id", "domain") DO NOTHING;
