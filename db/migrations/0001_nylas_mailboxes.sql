CREATE TABLE IF NOT EXISTS "nylas_mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nylas_mailboxes" ADD CONSTRAINT "nylas_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_nylas_mailboxes_grant" ON "nylas_mailboxes" USING btree ("grant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_nylas_mailboxes_org" ON "nylas_mailboxes" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nylas_mailboxes_org_id_idx" ON "nylas_mailboxes" USING btree ("organization_id");
