-- Hand-written, not drizzle-kit generated: see 0019/0020/0023's notes on
-- this repo's missing migrations/meta snapshots.

-- Old default (#4F46E5, indigo) violated this app's own brand rule
-- ("never blue/indigo as accent") and didn't match icon.svg's orange
-- favicon fallback, so a fresh org with no chosen color showed a
-- different color in the favicon than in the sidebar/Identity avatar.
-- New default matches icon.svg (#F47920) so both agree out of the box.
ALTER TABLE "worker_profiles" ALTER COLUMN "accent_color" SET DEFAULT '#F47920';
--> statement-breakpoint
-- Backfill rows that are still sitting at the old default (i.e. nobody
-- has deliberately picked a custom color) — a row that already has some
-- other custom accent_color is left untouched.
UPDATE "worker_profiles" SET "accent_color" = '#F47920' WHERE "accent_color" = '#4F46E5';
