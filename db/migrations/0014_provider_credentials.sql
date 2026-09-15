-- Per-agent credentials for a provider with no broker in front of it.
--
-- Composio-backed integrations are absent by design: Composio holds those
-- tokens, which is exactly why 3ebbb40 removed this app's encryption layer.
-- Nylas has no broker. An agent given its own Nylas application must keep that
-- application's client id and API key somewhere, and env cannot say "per
-- agent" — so they live here, encrypted.
--
-- `secrets` is one encrypted blob rather than a column per field, so a second
-- provider with a different credential shape needs no migration. It is
-- ciphertext at rest (AES-256-GCM) and never leaves an API route.
--
-- A missing row is not an error: the agent falls back to the fleet-wide
-- credentials in env, which is what most deployments will use.

CREATE TABLE IF NOT EXISTS "provider_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "secrets" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_org_provider_unique"
  ON "provider_credentials" ("organization_id", "provider");
