-- AgentDB joins Parchment in `integrations_config`. Adding an integration is
-- configuration, not a table: only the jsonb default changes.
--
-- AgentDB defaults to `enabled: false`. The internal agent path's scope is
-- always full (SQL/DML/DDL), so connecting a worker to the org's live database
-- is an opt-in a manager makes deliberately — unlike Parchment, which is
-- read-only and therefore default-allow.

ALTER TABLE "worker_profiles"
  ALTER COLUMN "integrations_config"
  SET DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null}}'::jsonb;
--> statement-breakpoint
-- Rows created before AgentDB existed get the same default slice, without
-- disturbing whatever they already chose for Parchment.
UPDATE "worker_profiles"
   SET "integrations_config" =
         COALESCE("integrations_config", '{}'::jsonb)
         || '{"agentdb":{"enabled":false,"workspaceId":null,"orgId":null}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'agentdb');
