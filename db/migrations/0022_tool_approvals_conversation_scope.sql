-- Hand-written, not drizzle-kit generated: see 0019/0020's own notes on this
-- repo's missing migrations/meta snapshots.

-- Scopes each pending tool approval to the assistant conversation that
-- proposed it, so confirm/cancel can never pick up an unrelated thread's
-- abandoned proposal instead of the one actually being discussed.
ALTER TABLE "tool_approvals" ADD COLUMN "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE;
CREATE INDEX "tool_approvals_conversation_idx" ON "tool_approvals" ("conversation_id");
