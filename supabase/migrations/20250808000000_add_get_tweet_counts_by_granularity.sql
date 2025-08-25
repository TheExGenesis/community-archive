-- Create new get_tweet_counts_by_granularity function to support minute and hour granularity
-- This fixes the stream-monitor chart to show proper time series data
-- Using new function name to avoid breaking existing applications

CREATE OR REPLACE FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text")
RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_tweet_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Updated to support minute and hour granularity
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Fixed date range filtering to not add interval to end_date
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= $1
        AND created_at < $2
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        tweet_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;

ALTER FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";