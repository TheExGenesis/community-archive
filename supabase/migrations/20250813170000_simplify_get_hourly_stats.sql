-- Simplify get_hourly_scraping_stats to avoid ambiguity issues

DROP FUNCTION IF EXISTS ca_website.get_hourly_scraping_stats CASCADE;
DROP FUNCTION IF EXISTS public.get_hourly_scraping_stats CASCADE;

-- Simple version that directly queries and computes without complex caching
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
    
    -- Direct query without caching for now
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
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COUNT(t.tweet_id)::bigint as tweet_count,
        0::integer as unique_scrapers  -- Placeholder for now
    FROM hours h
    LEFT JOIN public.tweets t ON 
        t.created_at >= h.hour_start AND 
        t.created_at < h.hour_end AND
        t.archive_upload_id IS NULL
    GROUP BY h.hour_start, h.hour_end
    ORDER BY h.hour_start;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_hourly_scraping_stats TO authenticated;