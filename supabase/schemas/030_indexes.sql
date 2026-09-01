-- Indexes for core tables moved out of prod.sql

-- public.all_profile
CREATE INDEX "idx_all_profile_archive_upload_id" ON "public"."all_profile" USING "btree" ("archive_upload_id");

-- public.archive_upload
CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");
CREATE INDEX "idx_archive_upload_username" ON "public"."archive_upload" USING "btree" ("username");

-- public.conversations
CREATE INDEX "idx_conversation_id" ON "public"."conversations" USING "btree" ("conversation_id");

-- public.followers
CREATE INDEX "idx_followers_account_id" ON "public"."followers" USING "btree" ("account_id");
CREATE INDEX "idx_followers_archive_upload_id" ON "public"."followers" USING "btree" ("archive_upload_id");

-- public.following
CREATE INDEX "idx_following_account_id" ON "public"."following" USING "btree" ("account_id");
CREATE INDEX "idx_following_archive_upload_id" ON "public"."following" USING "btree" ("archive_upload_id");

-- public.likes
CREATE INDEX "idx_likes_account_id" ON "public"."likes" USING "btree" ("account_id");
CREATE INDEX "idx_likes_archive_upload_id" ON "public"."likes" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_likes_liked_tweet_id" ON "public"."likes" USING "btree" ("liked_tweet_id");

-- public.mentioned_users
CREATE INDEX "idx_mentioned_users_user_id" ON "public"."mentioned_users" USING "btree" ("user_id");
CREATE INDEX "mentioned_users_screen_name_lower_idx" ON "public"."mentioned_users" USING "btree" ("lower"("screen_name")) WHERE ("screen_name" <> ''::"text");

-- public.tweet_media
CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");

-- public.optin
CREATE INDEX "idx_optin_opted_in" ON "public"."optin" USING "btree" ("opted_in") WHERE ("opted_in" = true);
CREATE INDEX "idx_optin_explicit_optout" ON "public"."optin" USING "btree" ("explicit_optout") WHERE ("explicit_optout" = true);
CREATE INDEX "optin_explicit_optout_twitter_user_id_idx" ON "public"."optin" USING "btree" ("twitter_user_id") WHERE (("explicit_optout" IS TRUE) AND ("twitter_user_id" IS NOT NULL));
CREATE INDEX "optin_explicit_optout_username_lower_idx" ON "public"."optin" USING "btree" (lower("username")) WHERE ("explicit_optout" IS TRUE);

CREATE INDEX "blocked_scraping_users_username_idx" ON "tes"."blocked_scraping_users" USING "btree" (lower("username")) WHERE ("username" IS NOT NULL);

CREATE INDEX "liked_tweets_author_account_id_idx" ON "public"."liked_tweets" USING "btree" ("author_account_id") WHERE ("author_account_id" IS NOT NULL);
CREATE INDEX "idx_optin_user_id" ON "public"."optin" USING "btree" ("user_id");
CREATE INDEX "idx_optin_username" ON "public"."optin" USING "btree" ("username");

-- public.tweet_urls
CREATE INDEX "idx_tweet_urls_expanded_url_gin" ON "public"."tweet_urls" USING "gin" ("expanded_url" "public"."gin_trgm_ops");
CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");

-- public.profile_curation / public.tweet_link_previews
CREATE INDEX "profile_curation_scope_idx" ON "public"."profile_curation" USING "btree" ("account_id", "section", "position");
CREATE UNIQUE INDEX "tweet_link_previews_normalized_url_key" ON "public"."tweet_link_previews" USING "btree" ("normalized_url");
CREATE INDEX "tweet_link_previews_expires_at_idx" ON "public"."tweet_link_previews" USING "btree" ("expires_at");

-- public.tweets
CREATE INDEX "idx_tweets_account_id" ON "public"."tweets" USING "btree" ("account_id");
CREATE INDEX "idx_tweets_archive_upload_id" ON "public"."tweets" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweets_created_at" ON "public"."tweets" USING "btree" ("created_at" DESC);
CREATE INDEX "idx_tweets_created_at_fts" ON "public"."tweets" USING "btree" ("created_at" DESC) WHERE ("fts" IS NOT NULL);
CREATE INDEX "idx_tweets_created_at_range" ON "public"."tweets" USING "brin" ("created_at") WITH ("pages_per_range"='128');
CREATE INDEX "idx_tweets_engagement" ON "public"."tweets" USING "btree" ("account_id", (("retweet_count" + "favorite_count")) DESC);
CREATE INDEX "idx_tweets_favorite_count" ON "public"."tweets" USING "btree" ("favorite_count");
CREATE INDEX "idx_tweets_null_archive_upload_id" ON "public"."tweets" USING "btree" ("updated_at" DESC) WHERE ("archive_upload_id" IS NULL);
CREATE INDEX "idx_tweets_reply_to_tweet_id" ON "public"."tweets" USING "btree" ("reply_to_tweet_id");
CREATE INDEX "idx_tweets_reply_to_user_id" ON "public"."tweets" USING "btree" ("reply_to_user_id");
CREATE INDEX "tweets_reply_to_username_lower_idx" ON "public"."tweets" USING "btree" ("lower"("reply_to_username")) WHERE ("reply_to_username" IS NOT NULL);
CREATE INDEX "tweets_retweeted_username_lower_idx" ON "public"."tweets" USING "btree" (lower(substring("full_text" FROM '^RT @([A-Za-z0-9_]{1,15}):'::"text"))) WHERE ("full_text" ~ '^RT @[A-Za-z0-9_]{1,15}:'::"text");
CREATE INDEX "idx_tweets_streaming" ON "public"."tweets" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);
CREATE INDEX "idx_tweets_updated_at" ON "public"."tweets" USING "btree" ("updated_at" DESC);
CREATE INDEX "idx_tweets_updated_at_tweet_id" ON "public"."tweets" USING "btree" ("updated_at", "tweet_id");
CREATE INDEX "text_fts" ON "public"."tweets" USING "gin" ("fts");
CREATE INDEX "idx_tweets_full_text_trgm" ON "public"."tweets" USING "gin" ("full_text" "public"."gin_trgm_ops");
CREATE INDEX "idx_tweets_fts_simple" ON "public"."tweets" USING "gin" (to_tsvector('simple'::regconfig, "full_text"));
CREATE INDEX "tweets_account_id_favorite_idx" ON "public"."tweets" USING "btree" ("account_id", "favorite_count" DESC);
CREATE INDEX "tweets_account_id_retweet_idx" ON "public"."tweets" USING "btree" ("account_id", "retweet_count" DESC);
CREATE INDEX "idx_tweets_account_created" ON public.tweets (account_id, created_at);

-- public.user_mentions
CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");
CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");


CREATE INDEX IF NOT EXISTS idx_quote_tweets_tweet_id ON public.quote_tweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_quote_tweets_quoted_tweet_id ON public.quote_tweets (quoted_tweet_id);

CREATE INDEX IF NOT EXISTS idx_retweets_tweet_id ON public.retweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_retweets_retweeted_tweet_id ON public.retweets (retweeted_tweet_id);

-- public.user_action_log
CREATE INDEX IF NOT EXISTS user_action_log_account_id_created_at_idx
  ON public.user_action_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_action_log_user_id_created_at_idx
  ON public.user_action_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_action_log_action_type_created_at_idx
  ON public.user_action_log (action_type, created_at DESC);

-- public.all_account: username is a hot lookup key (search_tweets from:/to:,
-- get_tweet_page_data, client .eq/.in('username')). See #387.
CREATE INDEX IF NOT EXISTS "idx_all_account_username"
  ON "public"."all_account" USING "btree" ("username");
CREATE INDEX IF NOT EXISTS "idx_all_account_lower_username"
  ON "public"."all_account" USING "btree" ("lower"("username"));
-- PostgREST's .ilike('username', value) uses the ILIKE operator directly, so
-- the btree indexes above cannot prevent a full-table scan. Trigrams support
-- both exact and wildcard ILIKE lookups.
CREATE INDEX IF NOT EXISTS "idx_all_account_username_trgm"
  ON "public"."all_account" USING "gin" ("username" "public"."gin_trgm_ops");
CREATE INDEX IF NOT EXISTS "idx_all_account_display_name_trgm"
  ON "public"."all_account" USING "gin" ("account_display_name" "public"."gin_trgm_ops");

-- private.tweet_user: every get_streaming_stats_* function filters on created_at.
CREATE INDEX IF NOT EXISTS "idx_tweet_user_created_at"
  ON "private"."tweet_user" USING "btree" ("created_at");
CREATE INDEX IF NOT EXISTS "digest_runs_date_created_idx"
  ON "public"."digest_runs" ("digest_date" DESC, "created_at" DESC);

CREATE INDEX IF NOT EXISTS "digest_runs_prompt_version_idx"
  ON "public"."digest_runs" ("prompt_version_id");

-- One subscription per address, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS "digest_email_subscriptions_email_key"
  ON "public"."digest_email_subscriptions" (lower("email"));

CREATE INDEX IF NOT EXISTS "digest_email_subscriptions_account_idx"
  ON "public"."digest_email_subscriptions" ("account_id")
  WHERE "account_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "digest_runs_one_nightly_run_per_date_idx"
  ON "public"."digest_runs" ("digest_date")
  WHERE "created_by" IS NULL
    AND "parent_run_id" IS NULL
    AND "workflow_run_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "digest_editions_one_published_per_date_idx"
  ON "public"."digest_editions" ("digest_date")
  WHERE "status" = 'published';

CREATE INDEX IF NOT EXISTS "digest_editions_public_archive_idx"
  ON "public"."digest_editions" ("digest_date" DESC, "published_at" DESC)
  WHERE "status" = 'published';

CREATE INDEX IF NOT EXISTS "digest_edition_likes_edition_idx"
  ON "public"."digest_edition_likes" ("edition_id");

CREATE INDEX IF NOT EXISTS "digest_edition_comments_edition_created_idx"
  ON "public"."digest_edition_comments" ("edition_id", "created_at");
CREATE INDEX IF NOT EXISTS "policy_storage_objects_account_ids_idx"
ON "private"."policy_storage_objects" USING "gin" ("account_ids");

CREATE INDEX IF NOT EXISTS "policy_storage_objects_username_hashes_idx"
ON "private"."policy_storage_objects" USING "gin" ("username_hashes");

CREATE INDEX IF NOT EXISTS "archive_clickhouse_delivery_pending_idx"
ON "private"."archive_clickhouse_delivery" ("next_attempt_at", "archive_upload_id")
WHERE ("delivery_state" = 'pending'::"text");
CREATE INDEX IF NOT EXISTS "community_projects_status_submitted_at_idx"
  ON "public"."community_projects" ("status", "submitted_at" DESC);
CREATE INDEX IF NOT EXISTS "community_project_likes_project_id_idx"
  ON "public"."community_project_likes" ("project_id");
CREATE INDEX IF NOT EXISTS "community_project_comments_project_id_created_at_idx"
  ON "public"."community_project_comments" ("project_id", "created_at");
