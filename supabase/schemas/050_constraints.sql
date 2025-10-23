-- Constraints and identity columns for moved tables

-- Identity columns
ALTER TABLE "public"."archive_upload" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."archive_upload_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."followers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."followers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."following" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."following_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."likes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."tweet_urls" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tweet_urls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."user_mentions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_mentions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Primary keys and unique constraints
ALTER TABLE ONLY "private"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("log_id");

ALTER TABLE ONLY "private"."tweet_user"
    ADD CONSTRAINT "tweet_user_pkey" PRIMARY KEY ("tweet_id");

ALTER TABLE ONLY "private"."user_intercepted_stats"
    ADD CONSTRAINT "user_intercepted_stats_pkey" PRIMARY KEY ("user_id", "date", "type");

ALTER TABLE ONLY "public"."all_account"
    ADD CONSTRAINT "all_account_pkey" PRIMARY KEY ("account_id");

ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_pkey" PRIMARY KEY ("account_id");

ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("tweet_id");

ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."liked_tweets"
    ADD CONSTRAINT "liked_tweets_pkey" PRIMARY KEY ("tweet_id");

ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."mentioned_users"
    ADD CONSTRAINT "mentioned_users_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_pkey" PRIMARY KEY ("media_id");

ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_url_key" UNIQUE ("tweet_id", "url");

ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_pkey" PRIMARY KEY ("tweet_id");

ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "tes"."blocked_scraping_users"
    ADD CONSTRAINT "blocked_scraping_users_pkey" PRIMARY KEY ("account_id");

-- Foreign keys
ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");
ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");

ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");

ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");
ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");

ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");

ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_liked_tweet_id_fkey" FOREIGN KEY ("liked_tweet_id") REFERENCES "public"."liked_tweets"("tweet_id");

ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");

ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");

ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");
ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");

ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."mentioned_users"("user_id");
ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");

-- public.optin constraints
ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_user_id_key" UNIQUE ("user_id");
ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_username_key" UNIQUE ("username");
ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- public.quote_tweets foreign keys
ALTER TABLE ONLY "public"."quote_tweets"
    ADD CONSTRAINT "fk_quote_tweets_tweet_id" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."quote_tweets"
    ADD CONSTRAINT "fk_quote_tweets_quoted_tweet_id" FOREIGN KEY ("quoted_tweet_id") REFERENCES "public"."tweets"("tweet_id") ON DELETE CASCADE;

-- public.retweets foreign keys
ALTER TABLE ONLY "public"."retweets"
    ADD CONSTRAINT "fk_retweets_tweet_id" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."retweets"
    ADD CONSTRAINT "fk_retweets_retweeted_tweet_id" FOREIGN KEY ("retweeted_tweet_id") REFERENCES "public"."tweets"("tweet_id") ON DELETE SET NULL;