-- A member may delete their Ask the archive history. Deleting clears what
-- they asked and were answered (question, answer, parts, cited ids, tool
-- calls, error) and sets deleted_at; the row stays with its accounting
-- (started_at, status, tokens, cost_usd, key_source) so the daily question
-- count and the global spend cap in agent_search_admit still count it.
-- Lists and conversations skip deleted rows.
ALTER TABLE "public"."agent_search_runs"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

-- History lists read a member's live runs newest first.
CREATE INDEX IF NOT EXISTS "agent_search_runs_account_live_idx"
  ON "public"."agent_search_runs" ("account_id", "started_at" DESC)
  WHERE "deleted_at" IS NULL;
