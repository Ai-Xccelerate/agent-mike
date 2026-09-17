-- Hand-written, not drizzle-kit generated: this repo's migrations/meta
-- snapshot files are missing for several past migrations (0001, 0006-0011,
-- 0015-0018), so `drizzle-kit generate` currently diffs against a stale
-- snapshot and produces bogus statements (re-creating tables that already
-- exist, dropping indexes that are still in use). That gap needs its own
-- fix later; this migration only contains the two statements actually
-- intended here.

-- system_prompt_template now holds only the *additional* instructions
-- beyond identity/role/tone — those are built deterministically in
-- lib/agent.ts's buildInstructions from the Identity/Role columns, not from
-- this field, so a manager editing it can no longer silently drop them.
ALTER TABLE "worker_profiles" ALTER COLUMN "system_prompt_template"
  SET DEFAULT 'Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.';
--> statement-breakpoint

-- One-time cleanup: any row still holding the old full-scaffold default
-- (identity block + trailing instruction, byte-for-byte) had its identity
-- portion made redundant by this change. Strip it down to just the
-- trailing instruction so the Agent Configuration UI doesn't show the
-- identity line twice. A hand-customized template that doesn't match this
-- exact string is left untouched.
UPDATE "worker_profiles"
SET "system_prompt_template" = 'Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.'
WHERE "system_prompt_template" = 'You are {{displayName}}, an AI worker for {{organizationName}}.
Role: {{role}}
Tone: {{tone}}
Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.';
