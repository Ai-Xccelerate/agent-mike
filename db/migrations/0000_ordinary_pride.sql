CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"ticket_number" integer NOT NULL,
	"channel" text DEFAULT 'chat' NOT NULL,
	"customer_name" text DEFAULT 'Website visitor' NOT NULL,
	"customer_email" text,
	"subject" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to" text,
	"confidence" real,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text NOT NULL,
	"checksum" text NOT NULL,
	"resource" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"body" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"site_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text DEFAULT 'Worker' NOT NULL,
	"display_name" text DEFAULT 'AI Worker' NOT NULL,
	"avatar_initials" text DEFAULT 'AW' NOT NULL,
	"email" text,
	"tone" text DEFAULT 'Warm, concise, and honest about uncertainty.' NOT NULL,
	"role" text DEFAULT 'Configure this worker''s role and responsibilities.' NOT NULL,
	"job_description" text,
	"system_prompt_template" text DEFAULT 'You are {{displayName}}, an AI worker for {{organizationName}}.
Role: {{role}}
Tone: {{tone}}
Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.' NOT NULL,
	"model" text DEFAULT 'gpt-5.6-luna' NOT NULL,
	"max_agent_turns" integer DEFAULT 3 NOT NULL,
	"confidence_threshold" real DEFAULT 0.72 NOT NULL,
	"escalation_terms" jsonb DEFAULT '["refund","chargeback","lawyer","breach","security incident","delete my account","cancel subscription"]'::jsonb NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"require_user_verification" boolean DEFAULT false NOT NULL,
	"manager_name" text DEFAULT 'Manager' NOT NULL,
	"manager_email" text,
	"auto_reply" boolean DEFAULT true NOT NULL,
	"tools_config" jsonb DEFAULT '{"browser_use":false,"internet":false,"scribe":false,"artifacts":false}'::jsonb NOT NULL,
	"channels_config" jsonb DEFAULT '{"email":false,"chat":true,"voice":false}'::jsonb NOT NULL,
	"ticket_prefix" text DEFAULT 'TCK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sites" ADD CONSTRAINT "widget_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_users" ADD CONSTRAINT "worker_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_org_idx" ON "conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_ticket_unique" ON "conversations" USING btree ("organization_id","ticket_number");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_org_concept_unique" ON "knowledge_documents" USING btree ("organization_id","concept_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_sites_org_unique" ON "widget_sites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_sites_token_unique" ON "widget_sites" USING btree ("site_token");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_profiles_org_unique" ON "worker_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_users_org_email_unique" ON "worker_users" USING btree ("organization_id","email");