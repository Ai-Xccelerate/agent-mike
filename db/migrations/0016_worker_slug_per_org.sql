-- Make the worker slug unique per org rather than globally.
--
-- `worker_profiles_slug_unique` covered `slug` alone, which is the same thing
-- as a per-org constraint right up until a deployment holds a second org — and
-- then it is fatal: every profile is created with the default slug "worker", so
-- the second agent could never be provisioned at all.
--
-- That made the "multi-tenant-ready from day one" claim in db/schema.ts untrue
-- in exactly one place. Two agents should each be free to call their worker
-- "support"; what must not collide is two workers inside one org.

DROP INDEX IF EXISTS "worker_profiles_slug_unique";
--> statement-breakpoint
-- Give existing rows a slug derived from their org before re-adding the index,
-- so any deployment that already collided can migrate rather than fail.
UPDATE "worker_profiles" p
   SET "slug" = "organization_id"
 WHERE EXISTS (
   SELECT 1 FROM "worker_profiles" q
    WHERE q."slug" = p."slug" AND q."id" <> p."id"
 );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_profiles_org_slug_unique"
  ON "worker_profiles" ("organization_id", "slug");
