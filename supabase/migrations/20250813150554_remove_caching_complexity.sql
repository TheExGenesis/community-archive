-- Remove caching complexity and simplify to show only last day view
-- This removes all the caching infrastructure and associated functions

-- Remove cron jobs first
SELECT cron.unschedule('update-daily-tweet-stats') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-daily-tweet-stats'
);

SELECT cron.unschedule('update-weekly-tweet-stats') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-weekly-tweet-stats'
);

-- Drop all caching-related functions
DROP FUNCTION IF EXISTS "public"."refresh_stream_monitor_cache"();
DROP FUNCTION IF EXISTS "public"."refresh_cached_stats"();
DROP FUNCTION IF EXISTS "public"."update_cached_stats"(text);
DROP FUNCTION IF EXISTS "public"."update_cached_stats_range"(text, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS "public"."get_cached_tweet_counts"(timestamp with time zone, timestamp with time zone, text);
DROP FUNCTION IF EXISTS "public"."get_cached_tweet_counts_by_granularity"(timestamp with time zone, timestamp with time zone, text);
DROP FUNCTION IF EXISTS "public"."get_streamed_tweet_counts_by_granularity"(timestamp with time zone, timestamp with time zone, text);

-- Drop the cached stats table
DROP TABLE IF EXISTS "public"."cached_tweet_stats";

-- Restore the simple streamed tweet counts function for last day only
CREATE OR REPLACE FUNCTION "public"."get_simple_streamed_tweet_counts"(
    "start_date" timestamp with time zone, 
    "end_date" timestamp with time zone, 
    "granularity" text
)
RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- Only support hour granularity for last day view
    IF granularity != 'hour' THEN
        RAISE EXCEPTION 'Only hour granularity is supported for simplified stream monitor';
    END IF;

    -- Only allow queries for the last 25 hours to keep it simple and fast
    IF start_date < (now() - interval '25 hours') THEN
        RAISE EXCEPTION 'Only queries for the last 25 hours are supported';
    END IF;

    RETURN QUERY EXECUTE format('
        SELECT 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
            COUNT(*) AS tweet_count 
        FROM 
            public.tweets 
        WHERE
            created_at >= $1
            AND created_at < $2
            AND archive_upload_id IS NULL
        GROUP BY 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'')
        ORDER BY 
            tweet_date
        ', granularity, granularity)
        USING start_date, end_date;
END;
$$;

-- Set proper ownership
ALTER FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" text) OWNER TO "postgres";

-- Clean up any remaining cron-related objects
DROP EXTENSION IF EXISTS pg_cron CASCADE;

-- Display confirmation
DO $$ 
BEGIN 
    RAISE NOTICE 'Caching complexity removed successfully:';
    RAISE NOTICE '- All caching tables and functions dropped';
    RAISE NOTICE '- Cron jobs cancelled';
    RAISE NOTICE '- Stream monitor simplified to last day view only';
    RAISE NOTICE '- Use get_simple_streamed_tweet_counts() for last 25 hours';
END 
$$;