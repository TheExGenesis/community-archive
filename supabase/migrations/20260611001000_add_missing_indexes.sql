-- Add indexes on hot lookup columns and drop duplicate indexes on the two
-- highest-write tables. Refs #387.
--
-- PRODUCTION NOTE: `tweets`, `likes`, `user_mentions`, `all_account`, and
-- private.tweet_user are large. On prod, prefer running each CREATE/DROP as
-- `... CONCURRENTLY` outside a transaction to avoid blocking writes. The plain
-- forms below are kept for the declarative schema / local + staging apply, which
-- run inside a transaction. If this migration is applied transactionally on prod,
-- schedule it during low traffic.

-- private.tweet_user grows one row per streamed tweet; every get_streaming_stats_*
-- function filters on created_at, but the only index was the PK on tweet_id.
CREATE INDEX IF NOT EXISTS "idx_tweet_user_created_at"
  ON "private"."tweet_user" USING "btree" ("created_at");

-- all_account had only its PK on account_id, but username is a hot lookup key in
-- search_tweets (LOWER(username)=LOWER(from_user)), get_tweet_page_data, and
-- several client queries.
CREATE INDEX IF NOT EXISTS "idx_all_account_username"
  ON "public"."all_account" USING "btree" ("username");
CREATE INDEX IF NOT EXISTS "idx_all_account_lower_username"
  ON "public"."all_account" USING "btree" ("lower"("username"));

-- Drop duplicate indexes (identical to idx_likes_account_id / idx_user_mentions_tweet_id).
-- They double index-maintenance cost on the two most-inserted tables.
DROP INDEX IF EXISTS "public"."likes_account_id_idx";
DROP INDEX IF EXISTS "public"."user_mentions_tweet_id_idx";
