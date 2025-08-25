-- Drop previous attempt if exists
DROP SCHEMA IF EXISTS ca_website CASCADE;

-- Create ca_website schema for website-specific functionality
CREATE SCHEMA ca_website;

-- Create simple table to store precomputed scraping statistics
CREATE TABLE ca_website.scraping_stats (
    period_type text NOT NULL CHECK (period_type IN ('hour', 'day', 'week', 'month')),
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    tweet_count bigint NOT NULL DEFAULT 0,
    unique_scrapers integer NOT NULL DEFAULT 0,
    last_updated timestamp with time zone NOT NULL DEFAULT now(),
    is_complete boolean NOT NULL DEFAULT false,
    PRIMARY KEY (period_type, period_start)
);

-- Create indexes
CREATE INDEX idx_scraping_stats_period_end ON ca_website.scraping_stats(period_end);
CREATE INDEX idx_scraping_stats_last_updated ON ca_website.scraping_stats(last_updated);

-- Simple function to compute scraping stats from raw data
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
            COUNT(tu.tweet_id) as tweet_count,
            COUNT(DISTINCT tu.scraped_username) as unique_scrapers
        FROM hours h
        LEFT JOIN private.tweet_user tu ON 
            tu.inserted >= h.hour_start AND 
            tu.inserted < h.hour_end
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

-- Function to get or compute hourly stats with caching
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
            SELECT 1 FROM ca_website.scraping_stats ss
            WHERE ss.period_type = 'hour'
              AND ss.period_start = date_trunc('hour', h)
              AND (
                  ss.period_end <= now()
                  OR (ss.period_start = v_current_hour AND ss.last_updated > now() - interval '5 minutes')
              )
        )
    ),
    new_stats AS (
        SELECT * FROM ca_website.compute_hourly_scraping_stats(
            (SELECT MIN(hour_start) FROM missing_hours),
            (SELECT MAX(hour_start) + interval '1 hour' FROM missing_hours)
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

-- Grant permissions
GRANT USAGE ON SCHEMA ca_website TO authenticated;
GRANT SELECT ON ca_website.scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.get_hourly_scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.compute_hourly_scraping_stats TO authenticated;