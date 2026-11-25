-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- The words customers use for each knowledge page: short questions a model writes for the page when it is indexed
-- (lib/knowledge-page-questions.ts). They are only matched against, so a customer who writes "open files list" finds
-- the page that says "Column Chooser". They are never shown to the worker as reference material.
CREATE TABLE IF NOT EXISTS "knowledge_page_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "page_id" text NOT NULL,
  -- The page text these were written from (knowledge_index_pages.content_hash): a changed page gets new ones.
  "content_hash" text NOT NULL,
  "question" text NOT NULL,
  "embedding" real[],
  "search" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("question", ''))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "knowledge_page_questions_page_idx" ON "knowledge_page_questions" ("organization_id", "source", "page_id");
CREATE INDEX IF NOT EXISTS "knowledge_page_questions_search_idx" ON "knowledge_page_questions" USING GIN ("search");
