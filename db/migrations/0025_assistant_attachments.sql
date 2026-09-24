-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Files uploaded into the admin Assistant ("Add files"). Only extracted text
-- is stored; the manager picks whether each file is chat context, knowledge
-- base content, or a custom skill (the latter two still need an explicit
-- confirm before anything is written).
CREATE TABLE IF NOT EXISTS "assistant_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "mime_type" text,
  "size_bytes" integer NOT NULL,
  "intent" text DEFAULT 'context' NOT NULL,
  "extracted_text" text NOT NULL,
  "truncated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_attachments_org_idx" ON "assistant_attachments" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_attachments_conversation_idx" ON "assistant_attachments" ("conversation_id");
--> statement-breakpoint
-- Lightweight refs to the files a manager attached to one Assistant message.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
