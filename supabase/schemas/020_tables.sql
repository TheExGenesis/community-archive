-- Core tables (moved from prod.sql)

-- private.logs
CREATE TABLE IF NOT EXISTS "private"."logs" (
    "log_id" integer NOT NULL,
    "log_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_type" "text",
    "error_message" "text",
    "error_code" "text",
    "context" "jsonb"
);
ALTER TABLE "private"."logs" OWNER TO "postgres";

-- private.tweet_user
CREATE TABLE IF NOT EXISTS "private"."tweet_user" (
    "tweet_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "private"."tweet_user" OWNER TO "postgres";

-- private.user_intercepted_stats
CREATE TABLE IF NOT EXISTS "private"."user_intercepted_stats" (
    "user_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "count" integer NOT NULL
);
ALTER TABLE "private"."user_intercepted_stats" OWNER TO "postgres";

-- public.all_account
CREATE TABLE IF NOT EXISTS "public"."all_account" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."all_account" OWNER TO "postgres";

-- public.archive_upload
CREATE TABLE IF NOT EXISTS "public"."archive_upload" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);
ALTER TABLE "public"."archive_upload" OWNER TO "postgres";

-- public.likes
CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "public"."likes" OWNER TO "postgres";

-- public.mentioned_users
CREATE TABLE IF NOT EXISTS "public"."mentioned_users" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."mentioned_users" OWNER TO "postgres";

-- public.tweets
CREATE TABLE IF NOT EXISTS "public"."tweets" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.10', "autovacuum_analyze_scale_factor"='0.05', "fillfactor"='90');
ALTER TABLE "public"."tweets" OWNER TO "postgres";

-- public.user_mentions
CREATE TABLE IF NOT EXISTS "public"."user_mentions" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."user_mentions" OWNER TO "postgres";

-- public.all_profile
CREATE TABLE IF NOT EXISTS "public"."all_profile" (
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."all_profile" OWNER TO "postgres";

-- public.conversations
CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" "text" NOT NULL,
    "conversation_id" "text"
);
ALTER TABLE "public"."conversations" OWNER TO "postgres";

-- public.tweet_urls
CREATE TABLE IF NOT EXISTS "public"."tweet_urls" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."tweet_urls" OWNER TO "postgres";

-- public.followers
CREATE TABLE IF NOT EXISTS "public"."followers" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."followers" OWNER TO "postgres";

-- public.following
CREATE TABLE IF NOT EXISTS "public"."following" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');
ALTER TABLE "public"."following" OWNER TO "postgres";

-- public.liked_tweets
CREATE TABLE IF NOT EXISTS "public"."liked_tweets" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "public"."liked_tweets" OWNER TO "postgres";

-- public.tweet_media
CREATE TABLE IF NOT EXISTS "public"."tweet_media" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "public"."tweet_media" OWNER TO "postgres";

-- public.scraper_count
CREATE TABLE IF NOT EXISTS "public"."scraper_count" (
    "count" bigint
);
ALTER TABLE "public"."scraper_count" OWNER TO "postgres";

-- public.optin
CREATE TABLE IF NOT EXISTS "public"."optin" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "twitter_user_id" "text",
    "opted_in" boolean DEFAULT false NOT NULL,
    "terms_version" "text" DEFAULT 'v1.0'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "opted_in_at" timestamp with time zone,
    "opted_out_at" timestamp with time zone,
    "explicit_optout" boolean DEFAULT false,
    "opt_out_reason" "text"
);
ALTER TABLE "public"."optin" OWNER TO "postgres";

-- tes.blocked_scraping_users
CREATE TABLE IF NOT EXISTS "tes"."blocked_scraping_users" (
    "account_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "tes"."blocked_scraping_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS public.quote_tweets (
    tweet_id TEXT NOT NULL,
    quoted_tweet_id TEXT NOT NULL,
    
    -- Composite primary key
    PRIMARY KEY (tweet_id, quoted_tweet_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_quote_tweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE
);

ALTER TABLE "public"."quote_tweets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS public.retweets (
    tweet_id TEXT NOT NULL PRIMARY KEY,
    retweeted_tweet_id TEXT NULL,
       
    CONSTRAINT fk_retweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE,
    CONSTRAINT fk_retweets_retweeted_tweet_id FOREIGN KEY (retweeted_tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE SET NULL
);

ALTER TABLE "public"."retweets" OWNER TO "postgres";