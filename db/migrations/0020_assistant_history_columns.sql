-- Hand-written, not drizzle-kit generated: see 0019's note on this repo's
-- missing migrations/meta snapshot files (0001, 0006-0011, 0015-0018) -
-- `drizzle-kit generate` still diffs against a stale snapshot and produces
-- bogus statements. Only the two columns actually intended here.

-- Assistant history: archive/restore instead of hard delete, and a rolling
-- summarization watermark so a long conversation's replay stays bounded.
ALTER TABLE "conversations" ADD COLUMN "summarized_message_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;
