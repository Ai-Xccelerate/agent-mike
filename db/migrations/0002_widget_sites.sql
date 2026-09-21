CREATE TABLE IF NOT EXISTS "widget_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"site_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "widget_sites" ADD CONSTRAINT "widget_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_widget_sites_token" ON "widget_sites" USING btree ("site_token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_widget_sites_org" ON "widget_sites" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "widget_sites_org_id_idx" ON "widget_sites" USING btree ("organization_id");
