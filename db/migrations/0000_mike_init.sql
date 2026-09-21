CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL,
  "display_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY,
  "name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_membership_org_user" ON "organization_memberships" ("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_memberships_org_id_idx" ON "organization_memberships" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_memberships_user_id_idx" ON "organization_memberships" ("user_id");

CREATE TABLE IF NOT EXISTS "agent_profiles" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "name" text DEFAULT 'Mike' NOT NULL,
  "display_name" text DEFAULT 'Agent Mike' NOT NULL,
  "email" text DEFAULT 'agent.mike@wkr.email' NOT NULL,
  "role" text DEFAULT 'Level 1 product support specialist for trained products and solutions.' NOT NULL,
  "tone" text DEFAULT 'Warm, concise, practical, and honest about uncertainty.' NOT NULL,
  "manager_name" text DEFAULT 'Support Manager' NOT NULL,
  "manager_email" text DEFAULT 'manager@example.com' NOT NULL,
  "auto_reply" boolean DEFAULT true NOT NULL,
  "confidence_threshold" double precision DEFAULT 0.72 NOT NULL,
  "max_agent_turns" integer DEFAULT 3 NOT NULL,
  "guardrails" jsonb DEFAULT '["Never invent product behavior or policies.","Never request passwords, secrets, or full payment card details.","Escalate billing disputes, security incidents, legal threats, and account deletion.","Use only the supplied knowledge when making product-specific claims."]'::jsonb NOT NULL,
  "escalation_terms" jsonb DEFAULT '["refund","chargeback","lawyer","breach","security incident","delete my account","cancel subscription"]'::jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_profiles_org" ON "agent_profiles" ("organization_id");

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "ticket_number" integer,
  "channel" text DEFAULT 'chat' NOT NULL,
  "customer_name" text DEFAULT 'Website visitor' NOT NULL,
  "customer_email" text,
  "subject" text DEFAULT 'Support conversation' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "assigned_to" text DEFAULT 'Mike' NOT NULL,
  "confidence" double precision,
  "summary" text,
  "external_thread_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "conversations_org_id_idx" ON "conversations" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversations_org_thread" ON "conversations" ("organization_id", "external_thread_id");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_type" text NOT NULL,
  "sender_name" text NOT NULL,
  "body" text NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" ("conversation_id");

CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "concept_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "resource" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_path" text,
  "body" text NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "checksum" text NOT NULL,
  "source_timestamp" text,
  "ingested_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_knowledge_org_concept" ON "knowledge_documents" ("organization_id", "concept_id");
CREATE INDEX IF NOT EXISTS "knowledge_documents_org_id_idx" ON "knowledge_documents" ("organization_id");

CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "heading" text,
  "content" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "knowledge_chunks_document_id_idx" ON "knowledge_chunks" ("document_id");
