ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "integrations_config" jsonb DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null}}'::jsonb NOT NULL;
--> statement-breakpoint
-- Rows created before this column existed get the same default shape.
UPDATE "worker_profiles"
   SET "integrations_config" = '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'parchment');
