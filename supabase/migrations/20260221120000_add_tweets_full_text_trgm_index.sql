-- Add pg_trgm GIN index on tweets.full_text to make ILIKE phrase search fast.
-- Without this index, ILIKE '%exact phrase%' does a full table scan and times out.
-- Disable statement timeout for this long-running index creation.
SET statement_timeout = '0';
CREATE INDEX IF NOT EXISTS "idx_tweets_full_text_trgm"
  ON "public"."tweets" USING "gin" ("full_text" "public"."gin_trgm_ops");
RESET statement_timeout;
