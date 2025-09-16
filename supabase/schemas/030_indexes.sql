-- Indexes for core tables moved out of prod.sql

-- public.all_profile
CREATE INDEX "idx_all_profile_archive_upload_id" ON "public"."all_profile" USING "btree" ("archive_upload_id");

-- public.archive_upload
CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");

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
-- Duplicate index present in prod; keep to maintain exact state
CREATE INDEX "likes_account_id_idx" ON "public"."likes" USING "btree" ("account_id");

-- public.mentioned_users
CREATE INDEX "idx_mentioned_users_user_id" ON "public"."mentioned_users" USING "btree" ("user_id");

-- public.tweet_media
CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");

-- public.optin
CREATE INDEX "idx_optin_opted_in" ON "public"."optin" USING "btree" ("opted_in") WHERE ("opted_in" = true);
CREATE INDEX "idx_optin_user_id" ON "public"."optin" USING "btree" ("user_id");
CREATE INDEX "idx_optin_username" ON "public"."optin" USING "btree" ("username");

-- public.tweet_urls
CREATE INDEX "idx_tweet_urls_expanded_url_gin" ON "public"."tweet_urls" USING "gin" ("expanded_url" "public"."gin_trgm_ops");
CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");

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
CREATE INDEX "idx_tweets_streaming" ON "public"."tweets" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);
CREATE INDEX "idx_tweets_updated_at" ON "public"."tweets" USING "btree" ("updated_at" DESC);
CREATE INDEX "idx_tweets_updated_at_tweet_id" ON "public"."tweets" USING "btree" ("updated_at", "tweet_id");
CREATE INDEX "text_fts" ON "public"."tweets" USING "gin" ("fts");
CREATE INDEX "tweets_account_id_favorite_idx" ON "public"."tweets" USING "btree" ("account_id", "favorite_count" DESC);
CREATE INDEX "tweets_account_id_retweet_idx" ON "public"."tweets" USING "btree" ("account_id", "retweet_count" DESC);

-- public.user_mentions
CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");
CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");
-- Duplicate index present in prod
CREATE INDEX "user_mentions_tweet_id_idx" ON "public"."user_mentions" USING "btree" ("tweet_id");
