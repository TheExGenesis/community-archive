-- Fix the scraping stats functions to use tweets table for streamed tweets
-- instead of private.tweet_user which is for scraped data

-- Drop existing functions
DROP FUNCTION IF EXISTS ca_website.compute_hourly_scraping_stats CASCADE;
DROP FUNCTION IF EXISTS ca_website.get_hourly_scraping_stats CASCADE;
DROP FUNCTION IF EXISTS public.compute_hourly_scraping_stats CASCADE;
DROP FUNCTION IF EXISTS public.get_hourly_scraping_stats CASCADE;

-- Recreate compute function using tweets table
CREATE OR REPLACE FUNCTION ca_website.compute_hourly_scraping_stats(
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH hours AS (
        SELECT 
            date_trunc('hour', h) as hour_start,
            date_trunc('hour', h) + interval '1 hour' as hour_end
        FROM generate_series(
            date_trunc('hour', p_start_date),
            date_trunc('hour', p_end_date),
            interval '1 hour'
        ) h
    ),
    stats AS (
        SELECT
            h.hour_start,
            h.hour_end,
            COUNT(t.tweet_id) as tweet_count,
            0 as unique_scrapers  -- For now, we don't track scrapers for streamed tweets
        FROM hours h
        LEFT JOIN public.tweets t ON 
            t.created_at >= h.hour_start AND 
            t.created_at < h.hour_end AND
            t.archive_upload_id IS NULL  -- Only streamed tweets
        GROUP BY h.hour_start, h.hour_end
    )
    SELECT 
        s.hour_start as period_start,
        s.hour_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM stats s
    ORDER BY s.hour_start;
END;
$$;

-- Recreate get function with caching
CREATE OR REPLACE FUNCTION ca_website.get_hourly_scraping_stats(
    p_hours_back integer DEFAULT 24
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_date timestamp with time zone;
    v_end_date timestamp with time zone;
    v_current_hour timestamp with time zone;
BEGIN
    -- Calculate date range
    v_end_date := now();
    v_start_date := v_end_date - (p_hours_back || ' hours')::interval;
    v_current_hour := date_trunc('hour', now());
    
    -- First, get any cached data that's still valid
    RETURN QUERY
    SELECT 
        ss.period_start,
        ss.period_end,
        ss.tweet_count,
        ss.unique_scrapers
    FROM ca_website.scraping_stats ss
    WHERE ss.period_type = 'hour'
      AND ss.period_start >= v_start_date
      AND ss.period_start < v_end_date
      AND (
          -- Use cache for completed hours
          ss.period_end <= now()
          -- Or for current hour if updated recently  
          OR (ss.period_start = v_current_hour AND ss.last_updated > now() - interval '5 minutes')
      );
    
    -- Compute and cache missing hours
    WITH missing_hours AS (
        SELECT date_trunc('hour', h) as hour_start
        FROM generate_series(
            date_trunc('hour', v_start_date),
            date_trunc('hour', v_end_date),
            interval '1 hour'
        ) h
        WHERE NOT EXISTS (
            SELECT 1 FROM ca_website.scraping_stats ss2
            WHERE ss2.period_type = 'hour'
              AND ss2.period_start = date_trunc('hour', h)
              AND (
                  ss2.period_end <= now()
                  OR (ss2.period_start = v_current_hour AND ss2.last_updated > now() - interval '5 minutes')
              )
        )
    ),
    new_stats AS (
        SELECT * FROM ca_website.compute_hourly_scraping_stats(
            (SELECT MIN(hour_start) FROM missing_hours),
            (SELECT COALESCE(MAX(hour_start) + interval '1 hour', now()) FROM missing_hours)
        )
        WHERE period_start IN (SELECT hour_start FROM missing_hours)
    )
    -- Insert new stats into cache
    INSERT INTO ca_website.scraping_stats (
        period_type,
        period_start,
        period_end,
        tweet_count,
        unique_scrapers,
        last_updated,
        is_complete
    )
    SELECT 
        'hour',
        ns.period_start,
        ns.period_end,
        ns.tweet_count,
        ns.unique_scrapers,
        now(),
        ns.period_end <= now()
    FROM new_stats ns
    ON CONFLICT (period_type, period_start) 
    DO UPDATE SET
        tweet_count = EXCLUDED.tweet_count,
        unique_scrapers = EXCLUDED.unique_scrapers,
        last_updated = EXCLUDED.last_updated,
        is_complete = EXCLUDED.is_complete
    RETURNING 
        scraping_stats.period_start,
        scraping_stats.period_end,
        scraping_stats.tweet_count,
        scraping_stats.unique_scrapers;
END;
$$;

-- Recreate public wrapper functions
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
BEGIN
    RETURN QUERY
    SELECT * FROM ca_website.get_hourly_scraping_stats(p_hours_back);
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_hourly_scraping_stats(
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone
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
BEGIN
    RETURN QUERY
    SELECT * FROM ca_website.compute_hourly_scraping_stats(p_start_date, p_end_date);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_hourly_scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_hourly_scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.get_hourly_scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.compute_hourly_scraping_stats TO authenticated;