-- Add indexes on hot lookup columns and drop duplicate indexes on the two
-- highest-write tables. Refs #387.
--
-- PRODUCTION NOTE: private.tweet_user, likes, and user_mentions are large.
-- Before recording this migration with `supabase db push`, run the equivalent
-- CREATE/DROP statements with `CONCURRENTLY` outside a transaction and verify
-- the new indexes are valid. The IF EXISTS / IF NOT EXISTS guards then make the
-- tracked migration a no-op on production while local/preview databases can use
-- these ordinary transactional forms.

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
