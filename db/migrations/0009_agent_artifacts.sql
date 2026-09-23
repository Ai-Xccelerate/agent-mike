-- Agent Artifacts joins the other integrations in `integrations_config`.
-- The live toolsConfig catalog still keeps an `artifacts` flag (Adarsh);
-- this migration only adds connect state, it does not drop that key.
--
-- It defaults to off, and to draft-only when on: it is the only write-capable
-- integration here, and `allowPublish` is what lets it put an artifact in front
-- of someone outside the workspace.

ALTER TABLE "worker_profiles"
  ALTER COLUMN "integrations_config"
  SET DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false}}'::jsonb;
--> statement-breakpoint
-- Rows created before Agent Artifacts existed get the same default slice,
-- without disturbing whatever they already chose for the other integrations.
UPDATE "worker_profiles"
   SET "integrations_config" =
         COALESCE("integrations_config", '{}'::jsonb)
         || '{"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'artifacts');
