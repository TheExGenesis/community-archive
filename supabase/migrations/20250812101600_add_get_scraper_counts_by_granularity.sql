-- Create function to get unique scraper counts by time granularity
-- This function counts distinct scrapers (user_id) from private.tweet_user table
-- Excludes system users and groups by time intervals

CREATE OR REPLACE FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text")
RETURNS TABLE("scraper_date" timestamp without time zone, "unique_scrapers" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_scraper_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Validate granularity parameter
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Query private.tweet_user to get unique scraper counts by time interval
    -- Exclude system users and group by the specified time granularity
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS scraper_date, 
        COUNT(DISTINCT user_id) AS unique_scrapers
    FROM 
        private.tweet_user 
    WHERE
        created_at >= $1
        AND created_at < $2
        AND user_id != ''system''
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        scraper_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;

ALTER FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";