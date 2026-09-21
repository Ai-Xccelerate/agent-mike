-- Agent Wiki joins the other integrations in `integrations_config`.
-- Adding an integration is configuration, not a table: only the jsonb default
-- changes, exactly as Scribe (0004) and Agent Artifacts (0006) did.
--
-- It defaults to off, and to read-only when switched on. A wiki is the
-- organization's own writing about itself, so reading it is close to Parchment
-- in spirit — but this integration can also rename, move and delete pages, and
-- a page a worker deleted is not obviously recoverable by the manager who let
-- it. `allowWrite` is therefore a separate decision from `enabled`.
--
-- Note that `allowWrite` never grants anything. Agent Wiki issues a key against
-- the person who created it and refuses a write that key lacks permission for,
-- whatever is stored here — this flag can only withhold.

ALTER TABLE "worker_profiles"
  ALTER COLUMN "integrations_config"
  SET DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false},"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false}}'::jsonb;
--> statement-breakpoint
-- Rows created before Agent Wiki existed get the same default slice, without
-- disturbing whatever they already chose for the other integrations.
UPDATE "worker_profiles"
   SET "integrations_config" =
         COALESCE("integrations_config", '{}'::jsonb)
         || '{"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'agent_wiki');
