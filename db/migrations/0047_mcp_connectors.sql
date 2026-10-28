-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Remote MCP servers an org admin adds under Settings > Connectors. The
-- discovered tool list and each tool's permission (auto | approval | off)
-- live on the row; the auth header value is encrypted (lib/crypto.ts).
CREATE TABLE IF NOT EXISTS "mcp_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "auth_type" text DEFAULT 'none' NOT NULL,
  "auth_header_name" text,
  "secret" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_error" text,
  "server_name" text,
  "tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tool_permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_connectors_org_idx" ON "mcp_connectors" ("organization_id");
