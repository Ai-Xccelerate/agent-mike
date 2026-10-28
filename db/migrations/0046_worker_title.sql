-- Hand-written, not drizzle-kit generated.

-- A short one-line title shown under the worker's name, e.g. "Customer support specialist".
ALTER TABLE "worker_profiles" ADD COLUMN IF NOT EXISTS "title" text DEFAULT '' NOT NULL;
