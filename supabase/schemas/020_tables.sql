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

-- Content-free manifest for policy-safe Firehose Parquet/DLQ objects. Objects
-- are deleted wholesale when any indexed author becomes policy-blocked.
CREATE TABLE IF NOT EXISTS "private"."policy_storage_objects" (
    "storage_class" "text" NOT NULL,
    "object_path" "text" NOT NULL,
    "account_ids" "text"[] NOT NULL,
    "username_hashes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "policy_storage_objects_pkey" PRIMARY KEY ("storage_class", "object_path"),
    CONSTRAINT "policy_storage_objects_storage_class_check" CHECK (("storage_class" = ANY (ARRAY['private'::"text", 'public'::"text"]))),
    CONSTRAINT "policy_storage_objects_path_check" CHECK (("object_path" ~ '^policy_safe_v1/'::"text")),
    CONSTRAINT "policy_storage_objects_account_ids_check" CHECK ((cardinality("account_ids") > 0)),
    CONSTRAINT "policy_storage_objects_account_ids_nonnull_check" CHECK ((array_position("account_ids", NULL::"text") IS NULL)),
    CONSTRAINT "policy_storage_objects_username_hashes_nonnull_check" CHECK ((array_position("username_hashes", NULL::"text") IS NULL)),
    CONSTRAINT "policy_storage_objects_username_hashes_format_check" CHECK (((cardinality("username_hashes") = 0) OR (array_to_string("username_hashes", ','::"text") ~ '^([0-9a-f]{64})(,[0-9a-f]{64})*$'::"text")))
);
ALTER TABLE "private"."policy_storage_objects" OWNER TO "postgres";
REVOKE ALL ON TABLE "private"."policy_storage_objects" FROM PUBLIC, "anon", "authenticated", "readclient";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "private"."policy_storage_objects" TO "service_role";

-- Durable keyset checkpoint for the bounded legacy liked-tweet policy sweep.
-- The operator is PostgreSQL-only; no API role can read or change its cursor.
CREATE TABLE IF NOT EXISTS "private"."policy_backfill_progress" (
    "job_name" "text" PRIMARY KEY,
    "last_tweet_id" "text",
    "rows_processed" bigint DEFAULT 0 NOT NULL,
    "authors_backfilled" bigint DEFAULT 0 NOT NULL,
    "tombstones_written" bigint DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "policy_backfill_progress_job_check" CHECK (("job_name" = 'legacy_liked_tweets_v1'::"text")),
    CONSTRAINT "policy_backfill_progress_counts_check" CHECK ((("rows_processed" >= 0) AND ("authors_backfilled" >= 0) AND ("tombstones_written" >= 0)))
);
ALTER TABLE "private"."policy_backfill_progress" OWNER TO "postgres";
REVOKE ALL ON TABLE "private"."policy_backfill_progress" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";

-- Durable phase checkpoints for the direct historical policy reconciliation.
CREATE TABLE IF NOT EXISTS "private"."policy_historical_reconcile_progress" (
    "job_name" "text" NOT NULL,
    "phase" "text" NOT NULL,
    "policy_version" "text" DEFAULT 'universal_policy_tombstones_v1'::"text" NOT NULL,
    "policy_fingerprint" "text" NOT NULL,
    "rows_affected" bigint DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "policy_historical_reconcile_progress_pkey" PRIMARY KEY ("job_name", "phase"),
    CONSTRAINT "policy_historical_reconcile_version_check" CHECK (("policy_version" = 'universal_policy_tombstones_v1'::"text")),
    CONSTRAINT "policy_historical_reconcile_fingerprint_check" CHECK (("policy_fingerprint" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "policy_historical_reconcile_rows_check" CHECK (("rows_affected" >= 0))
);
ALTER TABLE "private"."policy_historical_reconcile_progress" OWNER TO "postgres";
REVOKE ALL ON TABLE "private"."policy_historical_reconcile_progress" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";

-- Content-free stable-ID retry control for the direct archive-to-ClickHouse
-- sink. It intentionally has no foreign key to archive_upload because an
-- opt-out deletes upload metadata while its tombstone delivery must survive.
CREATE TABLE IF NOT EXISTS "private"."archive_clickhouse_delivery" (
    "archive_upload_id" bigint PRIMARY KEY,
    "account_id" "text" NOT NULL,
    "tweet_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "delivery_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error_code" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "archive_clickhouse_delivery_account_id_check" CHECK (("account_id" ~ '^(0|[1-9][0-9]*)$'::"text")),
    CONSTRAINT "archive_clickhouse_delivery_tweet_ids_nonnull_check" CHECK ((array_position("tweet_ids", NULL::"text") IS NULL)),
    CONSTRAINT "archive_clickhouse_delivery_tweet_ids_format_check" CHECK (((cardinality("tweet_ids") = 0) OR (array_to_string("tweet_ids", ','::"text") ~ '^((0|[1-9][0-9]*),)*(0|[1-9][0-9]*)$'::"text"))),
    CONSTRAINT "archive_clickhouse_delivery_state_check" CHECK (("delivery_state" = ANY (ARRAY['pending'::"text", 'delivered'::"text"]))),
    CONSTRAINT "archive_clickhouse_delivery_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "archive_clickhouse_delivery_error_code_check" CHECK ((("last_error_code" IS NULL) OR ("last_error_code" ~ '^[a-z0-9_]{1,80}$'::"text")))
);
ALTER TABLE "private"."archive_clickhouse_delivery" OWNER TO "postgres";
ALTER TABLE "private"."archive_clickhouse_delivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "private"."archive_clickhouse_delivery" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";
COMMENT ON TABLE "private"."archive_clickhouse_delivery" IS 'Content-free stable-ID retry control for independent new archive ClickHouse delivery; never a source for content reconstruction or historical backfill.';

-- Content-free commit receipts and entity ordering guards for the independent
-- canonical PostgreSQL queue consumer. These tables are intentionally private
-- and unavailable to every Data API role, including service_role.
CREATE TABLE IF NOT EXISTS "private"."canonical_ingest_receipts" (
    "event_id" "text" PRIMARY KEY,
    "stream_id" "text" UNIQUE NOT NULL,
    "source" "text" NOT NULL,
    "source_batch_id_hash" "text" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "mutation_count" integer NOT NULL,
    "committed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "canonical_ingest_receipts_event_id_check" CHECK (("event_id" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "canonical_ingest_receipts_stream_id_check" CHECK (("stream_id" ~ '^[0-9]+-[0-9]+$'::"text")),
    CONSTRAINT "canonical_ingest_receipts_source_check" CHECK (("source" = ANY (ARRAY['extension'::"text", 'autorefresh'::"text", 'archive_upload'::"text", 'manual'::"text", 'backfill'::"text", 'admin_delete'::"text", 'user_delete'::"text"]))),
    CONSTRAINT "canonical_ingest_receipts_source_batch_hash_check" CHECK (("source_batch_id_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "canonical_ingest_receipts_payload_hash_check" CHECK (("payload_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "canonical_ingest_receipts_mutation_count_check" CHECK ((("mutation_count" > 0) AND ("mutation_count" <= 500)))
);
ALTER TABLE "private"."canonical_ingest_receipts" OWNER TO "postgres";
ALTER TABLE "private"."canonical_ingest_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "private"."canonical_ingest_receipts" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";
COMMENT ON TABLE "private"."canonical_ingest_receipts" IS 'Content-free commit receipts for the canonical PostgreSQL queue consumer.';

CREATE TABLE IF NOT EXISTS "private"."canonical_ingest_entity_versions" (
    "entity_type" "text" NOT NULL,
    "entity_key_hash" "text" NOT NULL,
    "version" numeric(40, 0) NOT NULL,
    "event_id" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "canonical_ingest_entity_versions_pkey" PRIMARY KEY ("entity_type", "entity_key_hash"),
    CONSTRAINT "canonical_ingest_entity_versions_type_check" CHECK (("entity_type" = ANY (ARRAY['account'::"text", 'tweet_content'::"text", 'tweet_engagement'::"text", 'media'::"text", 'url'::"text", 'mention'::"text", 'relationship'::"text", 'archive_upload'::"text"]))),
    CONSTRAINT "canonical_ingest_entity_versions_key_hash_check" CHECK (("entity_key_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "canonical_ingest_entity_versions_version_check" CHECK (("version" >= (0)::numeric)),
    CONSTRAINT "canonical_ingest_entity_versions_event_id_check" CHECK (("event_id" ~ '^[0-9a-f]{64}$'::"text"))
);
ALTER TABLE "private"."canonical_ingest_entity_versions" OWNER TO "postgres";
ALTER TABLE "private"."canonical_ingest_entity_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "private"."canonical_ingest_entity_versions" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";
COMMENT ON TABLE "private"."canonical_ingest_entity_versions" IS 'Content-free latest-version guards for idempotent canonical PostgreSQL projection.';

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
    "is_tombstone" boolean DEFAULT false NOT NULL,
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
    "is_tombstone" boolean DEFAULT false NOT NULL,
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
    "is_tombstone" boolean DEFAULT false NOT NULL,
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
    "author_account_id" "text",
    "is_tombstone" boolean DEFAULT false NOT NULL,
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
    "block_source" "text" DEFAULT 'admin'::"text" NOT NULL,
    "username" "text",
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

-- Daily Digest email subscriptions. Single opt-in: a row exists only after
-- someone submits their address, confirmed_at is stamped at that moment,
-- sends go only to rows with confirmed_at set, and unsubscribed_at
-- permanently wins over both. Service-role only; tokens are the sole
-- credential in unsubscribe links, so rows must never be readable by anon or
-- authenticated clients.
CREATE TABLE IF NOT EXISTS "public"."digest_email_subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" text NOT NULL,
    -- Trusted Twitter provider id captured when the subscriber was signed in,
    -- so settings can show and manage the subscription. Nullable: guests
    -- subscribe with just an email.
    "account_id" text,
    "token" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "confirmed_at" timestamptz,
    "unsubscribed_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_email_subscriptions_email_length" CHECK (char_length(email) BETWEEN 3 AND 320),
    CONSTRAINT "digest_email_subscriptions_email_format" CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);
ALTER TABLE "public"."digest_email_subscriptions" OWNER TO "postgres";

-- One row per (edition, subscription) delivery so a re-run of the send cron
-- can never email the same edition to the same address twice.
CREATE TABLE IF NOT EXISTS "public"."digest_email_sends" (
    "edition_id" uuid NOT NULL REFERENCES "public"."digest_editions"("id") ON DELETE CASCADE,
    "subscription_id" uuid NOT NULL REFERENCES "public"."digest_email_subscriptions"("id") ON DELETE CASCADE,
    "message_id" text,
    "sent_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("edition_id", "subscription_id")
);
ALTER TABLE "public"."digest_email_sends" OWNER TO "postgres";

-- Reader appreciation for a published edition. One like per user per edition;
-- writes go through the API's service-role client after session verification.
CREATE TABLE IF NOT EXISTS "public"."digest_edition_likes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "edition_id" uuid NOT NULL REFERENCES "public"."digest_editions"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_edition_likes_edition_user_key" UNIQUE ("edition_id", "user_id")
);
ALTER TABLE "public"."digest_edition_likes" OWNER TO "postgres";

-- Reader comments on a published edition. The display identity is captured at
-- write time so rendering never joins auth.users; writes go through the API's
-- service-role client after session verification. Deletes are soft so a thread
-- keeps its shape.
CREATE TABLE IF NOT EXISTS "public"."digest_edition_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "edition_id" uuid NOT NULL REFERENCES "public"."digest_editions"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "content" text NOT NULL,
    "username" text,
    "display_name" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,
    CONSTRAINT "digest_edition_comments_content_length_check"
      CHECK (char_length("content") BETWEEN 1 AND 2000)
);
ALTER TABLE "public"."digest_edition_comments" OWNER TO "postgres";

-- Moderated Community Gallery submissions. Signed-in users submit through the
-- server; only published rows are exposed to public clients. Covers remain in
-- a private Storage bucket and are served through a status-gated route.
CREATE TABLE IF NOT EXISTS "public"."community_projects" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "slug" text NOT NULL UNIQUE,
    "name" text NOT NULL,
    "project_url" text NOT NULL,
    "creator_name" text NOT NULL,
    "creator_handle" text,
    "category" text NOT NULL,
    "description" text NOT NULL,
    "archive_use" text NOT NULL,
    "source_post_url" text NOT NULL,
    "tags" text[] NOT NULL DEFAULT ARRAY[]::text[],
    "cover_storage_path" text,
    "cover_mime_type" text,
    "submitted_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    "submitter_username" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "featured" boolean NOT NULL DEFAULT false,
    "submitted_at" timestamptz NOT NULL DEFAULT now(),
    "published_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    "published_at" timestamptz,
    CONSTRAINT "community_projects_name_length" CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT "community_projects_creator_name_length" CHECK (char_length(creator_name) BETWEEN 1 AND 120),
    CONSTRAINT "community_projects_creator_handle_length" CHECK (creator_handle IS NULL OR char_length(creator_handle) BETWEEN 1 AND 80),
    CONSTRAINT "community_projects_description_length" CHECK (char_length(description) BETWEEN 1 AND 360),
    CONSTRAINT "community_projects_archive_use_length" CHECK (char_length(archive_use) BETWEEN 1 AND 500),
    CONSTRAINT "community_projects_category_check" CHECK (category IN ('Tools', 'Experiments', 'Research', 'Games')),
    CONSTRAINT "community_projects_status_check" CHECK (status IN ('pending', 'published')),
    CONSTRAINT "community_projects_tags_count" CHECK (cardinality(tags) <= 8),
    CONSTRAINT "community_projects_cover_pair" CHECK ((cover_storage_path IS NULL) = (cover_mime_type IS NULL)),
    CONSTRAINT "community_projects_cover_mime" CHECK (cover_mime_type IS NULL OR cover_mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT "community_projects_publication_state" CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status = 'pending' AND published_at IS NULL AND published_by IS NULL)
    )
);
ALTER TABLE "public"."community_projects" OWNER TO "postgres";

-- Community Gallery likes. One row per (project, signed-in user); writes are
-- performed by server code after the session identity gate, and counts are
-- readable for any published project.
CREATE TABLE IF NOT EXISTS "public"."community_project_likes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL REFERENCES public.community_projects(id) ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "community_project_likes_project_user_key" UNIQUE ("project_id", "user_id")
);
ALTER TABLE "public"."community_project_likes" OWNER TO "postgres";

-- Community Gallery comments. Soft-deleted so a reader can retract a comment
-- without breaking the thread. The commenter's Twitter username and display
-- name are persisted at write time from the trusted session identity, so the
-- public list never needs to join auth.users.
CREATE TABLE IF NOT EXISTS "public"."community_project_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL REFERENCES public.community_projects(id) ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "content" text NOT NULL,
    "username" text,
    "display_name" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,
    CONSTRAINT "community_project_comments_content_length"
      CHECK (char_length("content") >= 1 AND char_length("content") <= 2000)
);
ALTER TABLE "public"."community_project_comments" OWNER TO "postgres";

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
