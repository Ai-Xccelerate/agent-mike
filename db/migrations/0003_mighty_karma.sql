ALTER TABLE "worker_profiles" ALTER COLUMN "tools_config" SET DEFAULT '{"browser_use":false,"internet_search":false,"scribe":false,"artifacts":false}'::jsonb;
--> statement-breakpoint
UPDATE "worker_profiles"
SET "tools_config" = ("tools_config" - 'internet') || jsonb_build_object('internet_search', "tools_config"->'internet')
WHERE "tools_config" ? 'internet';