-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- A searchable copy of an organization's external knowledge (first source: Confluence), cut into sections.
-- Nothing here is used to answer customers until an organization switches the index on.

-- One row per source page we have indexed, with the version it was at, so a sync only re-reads pages that changed.
CREATE TABLE IF NOT EXISTS "knowledge_index_pages" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "page_id" text NOT NULL,
  "title" text NOT NULL,
  "link" text,
  "version" integer,
  "content_hash" text NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "source", "page_id")
);

-- The sections (not `knowledge_chunks`, which belongs to locally uploaded articles). `embedding` is the meaning fingerprint (a plain float array, so it works on any Postgres; searched in
-- memory). `search` is the keyword index: the page title weighs most, then the heading, then the text.
CREATE TABLE IF NOT EXISTS "knowledge_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "page_id" text NOT NULL,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  "heading" text,
  "content" text NOT NULL,
  "embedding" real[],
  "search" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("heading", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'C')
  ) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "knowledge_sections_page_idx" ON "knowledge_sections" ("organization_id", "source", "page_id", "position");
CREATE INDEX IF NOT EXISTS "knowledge_sections_search_idx" ON "knowledge_sections" USING GIN ("search");

-- Where each sync is up to: when it last ran, what it found, and a lease so two servers never sync the same source at once.
CREATE TABLE IF NOT EXISTS "knowledge_index_state" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "running_until" timestamp with time zone,
  "last_started_at" timestamp with time zone,
  "last_finished_at" timestamp with time zone,
  "last_error" text,
  "pages" integer DEFAULT 0 NOT NULL,
  "chunks" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("organization_id", "source")
);
