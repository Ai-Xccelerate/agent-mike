-- Scribe (meeting notetaker) joins Parchment and AgentDB in `integrations_config`.
-- Adding an integration is configuration, not a table: only the jsonb default changes.
--
-- Scribe defaults to `enabled: false`. Every Scribe tool is read-only, so the
-- risk is disclosure rather than mutation: meeting transcripts are internal
-- talk, and grounding a customer-facing worker in them is a deliberate choice.

ALTER TABLE "worker_profiles"
  ALTER COLUMN "integrations_config"
  SET DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null}}'::jsonb;
--> statement-breakpoint
-- Rows created before Scribe existed get the same default slice, without
-- disturbing whatever they already chose for the other integrations.
UPDATE "worker_profiles"
   SET "integrations_config" =
         COALESCE("integrations_config", '{}'::jsonb)
         || '{"scribe":{"enabled":false,"lookbackDays":null}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'scribe');
