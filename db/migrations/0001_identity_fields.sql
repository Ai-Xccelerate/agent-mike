ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "slug" text DEFAULT 'worker' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "avatar_url" text;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "accent_color" text DEFAULT '#4F46E5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "bio" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'en-US' NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "email_signature" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_profiles_slug_unique" ON "worker_profiles" USING btree ("slug");
