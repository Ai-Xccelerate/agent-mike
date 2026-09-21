-- Agent Mike -> AI Worker Foundation.
--
-- The first three migrations are the schema already deployed in Mike's
-- Railway Postgres. This migration upgrades that data in place instead of
-- replaying Foundation's unrelated 0000 baseline over existing tables.

UPDATE "organizations" SET "name" = "id" WHERE "name" IS NULL OR btrim("name") = '';
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint

-- Preserve every Mike profile while adopting Foundation's richer shape.
ALTER TABLE "agent_profiles" RENAME TO "worker_profiles";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_agent_profiles_org";
--> statement-breakpoint
ALTER TABLE "worker_profiles" DROP CONSTRAINT IF EXISTS "agent_profiles_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "confidence_threshold" TYPE real;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "role" SET DEFAULT 'Configure this worker''s role and responsibilities.';
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "tone" SET DEFAULT 'Warm, concise, and honest about uncertainty.';
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "manager_name" SET DEFAULT 'Manager';
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "manager_email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ALTER COLUMN "manager_email" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "avatar_initials" text DEFAULT 'AM' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "slug" text DEFAULT 'mike' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "avatar_url" text;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "accent_color" text DEFAULT '#4F46E5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "bio" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "locale" text DEFAULT 'en-US' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "email_signature" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "job_description" text;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "system_prompt_template" text DEFAULT 'Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "model" text DEFAULT 'gpt-5.6-luna' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "require_user_verification" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "require_write_approval" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "assistant_actions_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "tools_config" jsonb DEFAULT '{"browser_use":false,"internet_search":false,"scribe":false,"artifacts":false}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "enabled_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "integrations_config" jsonb DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false},"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false},"agent_skills":{"enabled":false,"category":null,"maxResults":5}}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "channels_config" jsonb DEFAULT '{"email":false,"chat":true,"voice":false}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "ticket_prefix" text DEFAULT 'AIX' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "worker_profiles" SET
  "name" = COALESCE(NULLIF("name", ''), 'Mike'),
  "display_name" = COALESCE(NULLIF("display_name", ''), 'Agent Mike'),
  "avatar_initials" = 'AM',
  "slug" = 'mike',
  "ticket_prefix" = 'AIX';
--> statement-breakpoint
UPDATE "worker_profiles"
SET "manager_name" = 'Manager'
WHERE "manager_name" = 'Support Manager' AND "manager_email" = 'manager@example.com';
--> statement-breakpoint
UPDATE "worker_profiles" p
SET "channels_config" = jsonb_set(p."channels_config", '{email}', 'true'::jsonb)
WHERE EXISTS (
  SELECT 1 FROM "nylas_mailboxes" n
  WHERE n."organization_id" = p."organization_id" AND n."active" = true
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_profiles_org_unique" ON "worker_profiles" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_profiles_org_slug_unique" ON "worker_profiles" ("organization_id", "slug");
--> statement-breakpoint

-- Existing row ids were generated with randomUUID(), so casts preserve every
-- relationship rather than assigning replacement ids.
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_conversation_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" DROP CONSTRAINT IF EXISTS "knowledge_chunks_document_id_fkey";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "knowledge_documents" DROP CONSTRAINT IF EXISTS "knowledge_documents_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "widget_sites" DROP CONSTRAINT IF EXISTS "widget_sites_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" DROP CONSTRAINT IF EXISTS "nylas_mailboxes_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "conversation_id" TYPE uuid USING "conversation_id"::uuid;
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "document_id" TYPE uuid USING "document_id"::uuid;
--> statement-breakpoint
ALTER TABLE "widget_sites" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "widget_sites" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint

-- Foundation conversation lifecycle fields.
ALTER TABLE "conversations" ADD COLUMN "human_controlled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summarized_message_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
WITH maxima AS (
  SELECT "organization_id", COALESCE(MAX("ticket_number"), 1000) AS max_ticket
  FROM "conversations"
  GROUP BY "organization_id"
), missing AS (
  SELECT c."id", m.max_ticket + ROW_NUMBER() OVER (
    PARTITION BY c."organization_id" ORDER BY c."created_at", c."id"
  ) AS replacement
  FROM "conversations" c
  JOIN maxima m USING ("organization_id")
  WHERE c."ticket_number" IS NULL
)
UPDATE "conversations" c
SET "ticket_number" = missing.replacement
FROM missing
WHERE c."id" = missing."id";
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "ticket_number" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "confidence" TYPE real;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Foundation knowledge uses created_at; preserve Mike's ingestion timestamp.
ALTER TABLE "knowledge_documents" RENAME COLUMN "ingested_at" TO "created_at";
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Keep existing widget tokens and Nylas grants, adding Foundation state.
ALTER TABLE "nylas_mailboxes" ADD COLUMN "provider" text;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ADD COLUMN "status" text DEFAULT 'connected' NOT NULL;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ADD COLUMN "connected_by" text;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ADD COLUMN "connected_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ADD COLUMN "last_checked_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "nylas_mailboxes" SET "status" = CASE WHEN "active" THEN 'connected' ELSE 'disconnected' END;
--> statement-breakpoint
ALTER TABLE "widget_sites" ADD CONSTRAINT "widget_sites_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "nylas_mailboxes" ADD CONSTRAINT "nylas_mailboxes_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- New Foundation-owned tables.
CREATE TABLE "custom_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "requires" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_domains" (
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
CREATE TABLE "integration_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "integration_type" text NOT NULL,
  "system" text NOT NULL,
  "composio_auth_config_id" text NOT NULL,
  "composio_connected_account_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "connected_by" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "secrets" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tool_id" text NOT NULL,
  "called_by" text,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output" jsonb,
  "status" text DEFAULT 'success' NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "tool_id" text NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "result" jsonb,
  "error_message" text,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "name" text,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "worker_users" ("organization_id", "email", "name", "role")
SELECT m."organization_id", u."email", u."display_name",
  CASE WHEN m."role" IN ('owner', 'admin', 'member') THEN m."role" ELSE 'member' END
FROM "organization_memberships" m
JOIN "users" u ON u."id" = m."user_id"
WHERE m."status" = 'active'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Replace legacy index names with the schema's stable names.
DROP INDEX IF EXISTS "conversations_org_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_conversations_org_thread";
--> statement-breakpoint
DROP INDEX IF EXISTS "messages_conversation_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_knowledge_org_concept";
--> statement-breakpoint
DROP INDEX IF EXISTS "knowledge_chunks_document_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_widget_sites_token";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_widget_sites_org";
--> statement-breakpoint
DROP INDEX IF EXISTS "widget_sites_org_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_nylas_mailboxes_grant";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_nylas_mailboxes_org";
--> statement-breakpoint
DROP INDEX IF EXISTS "nylas_mailboxes_org_id_idx";
--> statement-breakpoint

CREATE INDEX "conversations_org_idx" ON "conversations" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_ticket_unique" ON "conversations" ("organization_id", "ticket_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_external_thread_unique" ON "conversations" ("organization_id", "external_thread_id");
--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" ("conversation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_org_concept_unique" ON "knowledge_documents" ("organization_id", "concept_id");
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_idx" ON "knowledge_chunks" ("document_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "widget_sites_org_unique" ON "widget_sites" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "widget_sites_token_unique" ON "widget_sites" ("site_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "nylas_mailboxes_org_unique" ON "nylas_mailboxes" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "nylas_mailboxes_grant_unique" ON "nylas_mailboxes" ("grant_id");
--> statement-breakpoint
CREATE INDEX "custom_skills_org_idx" ON "custom_skills" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_domains_org_domain_unique" ON "email_domains" ("organization_id", "domain");
--> statement-breakpoint
CREATE INDEX "email_domains_org_status_idx" ON "email_domains" ("organization_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_org_type_unique" ON "integration_connections" ("organization_id", "integration_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_org_provider_unique" ON "provider_credentials" ("organization_id", "provider");
--> statement-breakpoint
CREATE INDEX "tool_calls_org_idx" ON "tool_calls" ("organization_id");
--> statement-breakpoint
CREATE INDEX "tool_approvals_org_status_idx" ON "tool_approvals" ("organization_id", "status");
--> statement-breakpoint
CREATE INDEX "tool_approvals_conversation_idx" ON "tool_approvals" ("conversation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_users_org_email_unique" ON "worker_users" ("organization_id", "email");