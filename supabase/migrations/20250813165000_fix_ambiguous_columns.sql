-- Fix ambiguous column references in get_hourly_scraping_stats

DROP FUNCTION IF EXISTS ca_website.get_hourly_scraping_stats CASCADE;
DROP FUNCTION IF EXISTS public.get_hourly_scraping_stats CASCADE;

-- Recreate get function with fixed column references
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
        SELECT 
            cs.period_start,
            cs.period_end,
            cs.tweet_count,
            cs.unique_scrapers
        FROM ca_website.compute_hourly_scraping_stats(
            (SELECT MIN(hour_start) FROM missing_hours),
            (SELECT COALESCE(MAX(hour_start) + interval '1 hour', now()) FROM missing_hours)
        ) cs
        WHERE cs.period_start IN (SELECT hour_start FROM missing_hours)
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
        ca_website.scraping_stats.period_start,
        ca_website.scraping_stats.period_end,
        ca_website.scraping_stats.tweet_count,
        ca_website.scraping_stats.unique_scrapers;
END;
$$;

-- Recreate public wrapper function
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
    SELECT 
        hs.period_start,
        hs.period_end,
        hs.tweet_count,
        hs.unique_scrapers
    FROM ca_website.get_hourly_scraping_stats(p_hours_back) hs;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_hourly_scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.get_hourly_scraping_stats TO authenticated;