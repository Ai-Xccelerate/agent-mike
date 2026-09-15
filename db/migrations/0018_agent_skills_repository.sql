-- The AIX Skills repository joins the other integrations in
-- `integrations_config`. Adding one is configuration, not a table.
--
-- It is a third source of skills, next to the SKILL.md catalog in this repo
-- and the custom skills an org writes in Settings. What differs is how a skill
-- is found: those two are enumerated and toggled one at a time, while the
-- repository is searched by task description. So this slice holds a scope
-- (category) and a result cap, not a list of enabled ids — enabling skills one
-- by one would defeat the point of being able to find one nobody switched on.
--
-- Default off. Nothing here can write; the key only searches and loads
-- published skills. The reason it is opt-in is that every search and load is
-- logged upstream against this key, including the empty ones — somebody else's
-- visibility into how this worker works.

ALTER TABLE "worker_profiles"
  ALTER COLUMN "integrations_config"
  SET DEFAULT '{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false},"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false},"agent_skills":{"enabled":false,"category":null,"maxResults":5}}'::jsonb;
--> statement-breakpoint
UPDATE "worker_profiles"
   SET "integrations_config" =
         COALESCE("integrations_config", '{}'::jsonb)
         || '{"agent_skills":{"enabled":false,"category":null,"maxResults":5}}'::jsonb
 WHERE "integrations_config" IS NULL
    OR NOT ("integrations_config" ? 'agent_skills');
