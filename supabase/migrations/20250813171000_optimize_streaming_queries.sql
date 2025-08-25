-- Add index to optimize streaming tweet queries
CREATE INDEX IF NOT EXISTS idx_tweets_streaming 
ON public.tweets(created_at) 
WHERE archive_upload_id IS NULL;

-- Recreate function with optimized query
DROP FUNCTION IF EXISTS public.get_hourly_scraping_stats CASCADE;

CREATE OR REPLACE FUNCTION public.get_hourly_scraping_stats(
    p_hours_back integer DEFAULT 24
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date timestamp with time zone;
    v_end_date timestamp with time zone;
BEGIN
    -- Calculate date range
    v_end_date := now();
    v_start_date := v_end_date - (p_hours_back || ' hours')::interval;
    
    -- Limit hours to prevent timeout
    IF p_hours_back > 168 THEN  -- Max 1 week
        RAISE EXCEPTION 'Maximum 168 hours (1 week) allowed';
    END IF;
    
    -- Optimized query with limited date range
    RETURN QUERY
    WITH hours AS (
        SELECT 
            date_trunc('hour', h) as hour_start,
            date_trunc('hour', h) + interval '1 hour' as hour_end
        FROM generate_series(
            date_trunc('hour', v_start_date),
            date_trunc('hour', v_end_date),
            interval '1 hour'
        ) h
    ),
    tweet_counts AS (
        SELECT
            date_trunc('hour', t.created_at) as hour,
            COUNT(*) as cnt
        FROM public.tweets t
        WHERE 
            t.created_at >= v_start_date AND 
            t.created_at < v_end_date AND
            t.archive_upload_id IS NULL
        GROUP BY date_trunc('hour', t.created_at)
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COALESCE(tc.cnt, 0)::bigint as tweet_count,
        0::integer as unique_scrapers
    FROM hours h
    LEFT JOIN tweet_counts tc ON tc.hour = h.hour_start
    ORDER BY h.hour_start;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_hourly_scraping_stats TO authenticated;

-- Also create a simpler version for testing
CREATE OR REPLACE FUNCTION public.get_hourly_stats_simple(
    p_hours_back integer DEFAULT 24
)
RETURNS TABLE(
    period_start timestamp with time zone,
    tweet_count bigint
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        date_trunc('hour', created_at) as period_start,
        COUNT(*)::bigint as tweet_count
    FROM public.tweets
    WHERE 
        created_at >= now() - (p_hours_back || ' hours')::interval AND
        archive_upload_id IS NULL
    GROUP BY date_trunc('hour', created_at)
    ORDER BY period_start;
$$;

GRANT EXECUTE ON FUNCTION public.get_hourly_stats_simple TO authenticated;