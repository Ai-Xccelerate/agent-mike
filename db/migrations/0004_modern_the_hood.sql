CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
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
DROP TABLE "integration_credentials" CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_org_type_unique" ON "integration_connections" USING btree ("organization_id","integration_type");