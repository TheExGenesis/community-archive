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
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum",
    "username" "text"
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
    "retweet_count" integer,
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
    "width" integer,
    "height" integer,
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
    "user_id" "uuid",
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
    PRIMARY KEY (tweet_id, quoted_tweet_id)
);

ALTER TABLE "public"."quote_tweets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS public.retweets (
    tweet_id TEXT NOT NULL PRIMARY KEY,
    retweeted_tweet_id TEXT NULL
);

ALTER TABLE "public"."retweets" OWNER TO "postgres";

-- ca_autorefresh.account_refresh_log
CREATE TABLE IF NOT EXISTS "ca_autorefresh"."account_refresh_log" (
    "account_id" "text" NOT NULL
);
ALTER TABLE "ca_autorefresh"."account_refresh_log" OWNER TO "postgres";

-- Append-only event log of user actions in the archive: uploads, opt-in/out state
-- changes, and deletes. account_id (= twitter account, JWT provider_id) and user_id
-- (auth.users.id at the time) are both nullable so events recorded after a delete
-- still land cleanly. metadata is for ad-hoc per-event details (archive_upload_id,
-- archive_at, etc.); notes is free-form.
CREATE TABLE IF NOT EXISTS "public"."user_action_log" (
    "id"          BIGSERIAL PRIMARY KEY,
    "account_id"  TEXT,
    "user_id"     UUID,
    "action_type" TEXT NOT NULL,
    "metadata"    JSONB,
    "notes"       TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "public"."user_action_log" OWNER TO "postgres";

-- Daily Digest editorial state. Analytical candidates come from ClickHouse,
-- while PostgreSQL owns prompt/run history and publication status.
CREATE TABLE IF NOT EXISTS "public"."digest_prompt_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "version" bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    "label" text NOT NULL,
    "system_prompt" text NOT NULL,
    "user_prompt_template" text NOT NULL,
    "model" text NOT NULL,
    "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_by" uuid,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_prompt_versions_label_length" CHECK (char_length(label) BETWEEN 1 AND 120),
    CONSTRAINT "digest_prompt_versions_system_prompt_length" CHECK (char_length(system_prompt) BETWEEN 1 AND 20000),
    CONSTRAINT "digest_prompt_versions_user_prompt_length" CHECK (char_length(user_prompt_template) BETWEEN 1 AND 20000),
    CONSTRAINT "digest_prompt_versions_model_length" CHECK (char_length(model) BETWEEN 1 AND 120),
    CONSTRAINT "digest_prompt_versions_parameters_object" CHECK (jsonb_typeof(parameters) = 'object')
);
ALTER TABLE "public"."digest_prompt_versions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."digest_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "digest_date" date NOT NULL,
    "status" text NOT NULL DEFAULT 'candidates_ready',
    "prompt_version_id" uuid NOT NULL REFERENCES "public"."digest_prompt_versions"("id"),
    "window_start" timestamptz NOT NULL,
    "window_end" timestamptz NOT NULL,
    "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "model_request" jsonb,
    "raw_response" jsonb,
    "parsed_output" jsonb,
    "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "response_id" text,
    "model" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "total_tokens" integer,
    "duration_ms" integer,
    "error" text,
    "created_by" uuid,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "started_at" timestamptz,
    "completed_at" timestamptz,
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_runs_status_check" CHECK (status IN ('candidates_ready', 'running', 'completed', 'failed')),
    CONSTRAINT "digest_runs_window_check" CHECK (window_end > window_start),
    CONSTRAINT "digest_runs_candidates_array" CHECK (jsonb_typeof(candidates) = 'array'),
    CONSTRAINT "digest_runs_events_array" CHECK (jsonb_typeof(events) = 'array'),
    CONSTRAINT "digest_runs_model_request_object" CHECK (model_request IS NULL OR jsonb_typeof(model_request) = 'object'),
    CONSTRAINT "digest_runs_raw_response_object" CHECK (raw_response IS NULL OR jsonb_typeof(raw_response) = 'object'),
    CONSTRAINT "digest_runs_parsed_output_object" CHECK (parsed_output IS NULL OR jsonb_typeof(parsed_output) = 'object'),
    CONSTRAINT "digest_runs_token_counts_nonnegative" CHECK (coalesce(input_tokens, 0) >= 0 AND coalesce(output_tokens, 0) >= 0 AND coalesce(total_tokens, 0) >= 0),
    CONSTRAINT "digest_runs_duration_nonnegative" CHECK (duration_ms IS NULL OR duration_ms >= 0)
);
ALTER TABLE "public"."digest_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."digest_editions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "issue_number" bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    "digest_date" date NOT NULL,
    "version" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'draft',
    "source_run_id" uuid NOT NULL REFERENCES "public"."digest_runs"("id"),
    "content" jsonb NOT NULL,
    "created_by" uuid,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "published_at" timestamptz,
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_editions_date_version_key" UNIQUE ("digest_date", "version"),
    CONSTRAINT "digest_editions_version_positive" CHECK (version > 0),
    CONSTRAINT "digest_editions_status_check" CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT "digest_editions_content_object" CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT "digest_editions_publication_time_check" CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);
ALTER TABLE "public"."digest_editions" OWNER TO "postgres";

-- Public profile preferences. PostgreSQL remains authoritative for this
-- owner-controlled policy state; analytical stores only consume the result.
CREATE TABLE IF NOT EXISTS "public"."profile_settings" (
    "account_id" TEXT NOT NULL,
    "download_archive_visible" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "public"."profile_settings" OWNER TO "postgres";

-- Sparse owner overrides for the generated sections on the overall profile.
-- Year chapters remain entirely generated and are intentionally out of scope.
CREATE TABLE IF NOT EXISTS "public"."profile_curation" (
    "account_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT FALSE,
    "is_featured" BOOLEAN NOT NULL DEFAULT FALSE,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "public"."profile_curation" OWNER TO "postgres";

-- Normalized, server-fetched link metadata shared by every tweet surface.
-- Only service-role code writes this cache; public clients can read it.
CREATE TABLE IF NOT EXISTS "public"."tweet_link_previews" (
    "url_hash" TEXT NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "canonical_url" TEXT,
    "title" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "site_name" TEXT,
    "content_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fetched_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "public"."tweet_link_previews" OWNER TO "postgres";
