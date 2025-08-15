-- Create ca_website schema for website-specific functionality
CREATE SCHEMA IF NOT EXISTS ca_website;

-- Create enum type for period types
CREATE TYPE ca_website.period_type AS ENUM ('hour', 'day', 'week', 'month');

-- Create table to store precomputed scraping statistics
CREATE TABLE ca_website.scraping_stats (
    period_type ca_website.period_type NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    tweet_count bigint NOT NULL DEFAULT 0,
    unique_scrapers integer NOT NULL DEFAULT 0,
    scraper_details jsonb, -- Store detailed scraper breakdown if needed
    last_updated timestamp with time zone NOT NULL DEFAULT now(),
    is_complete boolean NOT NULL DEFAULT false, -- True when period is finished and won't change
    CONSTRAINT scraping_stats_pkey PRIMARY KEY (period_type, period_start)
);

-- Create indexes for efficient querying
CREATE INDEX idx_scraping_stats_period_end ON ca_website.scraping_stats(period_end);
CREATE INDEX idx_scraping_stats_last_updated ON ca_website.scraping_stats(last_updated);
CREATE INDEX idx_scraping_stats_is_complete ON ca_website.scraping_stats(is_complete);

-- Create private schema function to compute scraping stats from raw data
CREATE OR REPLACE FUNCTION private.compute_scraping_stats(
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone,
    p_granularity ca_website.period_type DEFAULT 'day'
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer,
    scraper_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH period_bounds AS (
        SELECT
            date_trunc(
                CASE p_granularity::text
                    WHEN 'hour' THEN 'hour'
                    WHEN 'day' THEN 'day'
                    WHEN 'week' THEN 'week'
                    WHEN 'month' THEN 'month'
                END,
                gs.period_start
            ) AS period_start,
            date_trunc(
                CASE p_granularity::text
                    WHEN 'hour' THEN 'hour'
                    WHEN 'day' THEN 'day'
                    WHEN 'week' THEN 'week'
                    WHEN 'month' THEN 'month'
                END,
                gs.period_start
            ) + 
            CASE p_granularity::text
                WHEN 'hour' THEN interval '1 hour'
                WHEN 'day' THEN interval '1 day'
                WHEN 'week' THEN interval '1 week'
                WHEN 'month' THEN interval '1 month'
            END AS period_end
        FROM generate_series(
            date_trunc(
                CASE p_granularity::text
                    WHEN 'hour' THEN 'hour'
                    WHEN 'day' THEN 'day'
                    WHEN 'week' THEN 'week'
                    WHEN 'month' THEN 'month'
                END,
                p_start_date
            ),
            p_end_date,
            CASE p_granularity::text
                WHEN 'hour' THEN interval '1 hour'
                WHEN 'day' THEN interval '1 day'
                WHEN 'week' THEN interval '1 week'
                WHEN 'month' THEN interval '1 month'
            END
        ) AS gs(period_start)
    ),
    stats AS (
        SELECT
            pb.period_start,
            pb.period_end,
            COUNT(tu.tweet_id) AS tweet_count,
            COUNT(DISTINCT tu.scraped_username) AS unique_scrapers,
            jsonb_object_agg(
                COALESCE(tu.scraped_username, 'unknown'),
                count_by_scraper
            ) FILTER (WHERE tu.scraped_username IS NOT NULL) AS scraper_details
        FROM period_bounds pb
        LEFT JOIN LATERAL (
            SELECT 
                tweet_id,
                scraped_username,
                COUNT(*) OVER (PARTITION BY scraped_username) as count_by_scraper
            FROM private.tweet_user
            WHERE inserted >= pb.period_start
              AND inserted < pb.period_end
        ) tu ON true
        GROUP BY pb.period_start, pb.period_end
    )
    SELECT 
        s.period_start,
        s.period_end,
        s.tweet_count,
        s.unique_scrapers,
        s.scraper_details
    FROM stats s
    ORDER BY s.period_start;
END;
$$;

-- Function to get or compute scraping stats with smart caching
CREATE OR REPLACE FUNCTION ca_website.get_or_compute_scraping_stats(
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone,
    p_granularity ca_website.period_type DEFAULT 'day'
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer,
    scraper_details jsonb,
    from_cache boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_period_start timestamp with time zone;
    v_current_period_end timestamp with time zone;
    v_cache_threshold interval := interval '5 minutes';
BEGIN
    -- Determine current period based on granularity
    v_current_period_start := date_trunc(
        CASE p_granularity::text
            WHEN 'hour' THEN 'hour'
            WHEN 'day' THEN 'day'
            WHEN 'week' THEN 'week'
            WHEN 'month' THEN 'month'
        END,
        now()
    );
    
    v_current_period_end := v_current_period_start + 
        CASE p_granularity::text
            WHEN 'hour' THEN interval '1 hour'
            WHEN 'day' THEN interval '1 day'
            WHEN 'week' THEN interval '1 week'
            WHEN 'month' THEN interval '1 month'
        END;

    -- Create temp table to store results
    CREATE TEMP TABLE IF NOT EXISTS temp_stats_results (
        period_start timestamp with time zone,
        period_end timestamp with time zone,
        tweet_count bigint,
        unique_scrapers integer,
        scraper_details jsonb,
        from_cache boolean
    ) ON COMMIT DROP;
    
    -- Get cached stats for completed periods
    INSERT INTO temp_stats_results
    SELECT 
        ss.period_start,
        ss.period_end,
        ss.tweet_count,
        ss.unique_scrapers,
        ss.scraper_details,
        true AS from_cache
    FROM ca_website.scraping_stats ss
    WHERE ss.period_type = p_granularity
      AND ss.period_start >= p_start_date
      AND ss.period_start < p_end_date
      AND (
          -- Use cache for completed periods
          ss.is_complete = true
          OR 
          -- Use cache for current period if updated recently
          (ss.period_start = v_current_period_start 
           AND ss.last_updated > now() - v_cache_threshold)
          OR
          -- Use cache for non-current periods
          ss.period_start < v_current_period_start
      );
    
    -- Compute missing periods
    WITH missing_periods AS (
        SELECT DISTINCT
            date_trunc(
                CASE p_granularity::text
                    WHEN 'hour' THEN 'hour'
                    WHEN 'day' THEN 'day'
                    WHEN 'week' THEN 'week'
                    WHEN 'month' THEN 'month'
                END,
                gs.period_start
            ) AS period_start
        FROM generate_series(
            p_start_date,
            p_end_date - interval '1 second',
            CASE p_granularity::text
                WHEN 'hour' THEN interval '1 hour'
                WHEN 'day' THEN interval '1 day'
                WHEN 'week' THEN interval '1 week'
                WHEN 'month' THEN interval '1 month'
            END
        ) AS gs(period_start)
        WHERE NOT EXISTS (
            SELECT 1 
            FROM temp_stats_results tsr
            WHERE tsr.period_start = date_trunc(
                CASE p_granularity::text
                    WHEN 'hour' THEN 'hour'
                    WHEN 'day' THEN 'day'
                    WHEN 'week' THEN 'week'
                    WHEN 'month' THEN 'month'
                END,
                gs.period_start
            )
        )
    ),
    computed_stats AS (
        SELECT * 
        FROM private.compute_scraping_stats(
            (SELECT MIN(period_start) FROM missing_periods),
            (SELECT MAX(period_start) + 
                CASE p_granularity::text
                    WHEN 'hour' THEN interval '1 hour'
                    WHEN 'day' THEN interval '1 day'
                    WHEN 'week' THEN interval '1 week'
                    WHEN 'month' THEN interval '1 month'
                END 
             FROM missing_periods),
            p_granularity
        )
        WHERE period_start IN (SELECT period_start FROM missing_periods)
    )
    -- Insert computed stats into cache and add to results
    INSERT INTO temp_stats_results
    SELECT 
        cs.period_start,
        cs.period_end,
        cs.tweet_count,
        cs.unique_scrapers,
        cs.scraper_details,
        false AS from_cache
    FROM computed_stats cs;
    
    -- Also insert into persistent cache
    INSERT INTO ca_website.scraping_stats (
        period_type,
        period_start,
        period_end,
        tweet_count,
        unique_scrapers,
        scraper_details,
        last_updated,
        is_complete
    )
    SELECT 
        p_granularity,
        cs.period_start,
        cs.period_end,
        cs.tweet_count,
        cs.unique_scrapers,
        cs.scraper_details,
        now(),
        cs.period_end <= now() -- Mark as complete if period has ended
    FROM computed_stats cs
    ON CONFLICT (period_type, period_start) 
    DO UPDATE SET
        tweet_count = EXCLUDED.tweet_count,
        unique_scrapers = EXCLUDED.unique_scrapers,
        scraper_details = EXCLUDED.scraper_details,
        last_updated = EXCLUDED.last_updated,
        is_complete = EXCLUDED.is_complete;
    
    -- Return combined results
    RETURN QUERY
    SELECT * FROM temp_stats_results
    ORDER BY period_start;
END;
$$;

-- Function to mark completed periods (can be called by cron job)
CREATE OR REPLACE FUNCTION ca_website.mark_completed_periods()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE ca_website.scraping_stats
    SET is_complete = true
    WHERE is_complete = false
      AND period_end <= now();
END;
$$;

-- Function to get scraping stats for stream monitor (server-side only)
CREATE OR REPLACE FUNCTION ca_website.get_stream_monitor_stats(
    p_hours_back integer DEFAULT 24
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer,
    top_scrapers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            s.period_start,
            s.period_end,
            s.tweet_count,
            s.unique_scrapers,
            s.scraper_details,
            s.from_cache
        FROM ca_website.get_or_compute_scraping_stats(
            now() - (p_hours_back || ' hours')::interval,
            now(),
            'hour'::ca_website.period_type
        ) s
    )
    SELECT 
        s.period_start,
        s.period_end,
        s.tweet_count,
        s.unique_scrapers,
        CASE 
            WHEN s.scraper_details IS NOT NULL THEN
                (SELECT jsonb_object_agg(key, value)
                 FROM (
                     SELECT key, value
                     FROM jsonb_each(s.scraper_details)
                     ORDER BY value::int DESC
                     LIMIT 5
                 ) top)
            ELSE NULL
        END AS top_scrapers
    FROM stats s
    ORDER BY s.period_start;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA ca_website TO authenticated;
GRANT SELECT ON ca_website.scraping_stats TO authenticated;
GRANT EXECUTE ON FUNCTION ca_website.get_stream_monitor_stats TO authenticated;

-- Revoke direct access to private functions
REVOKE ALL ON FUNCTION private.compute_scraping_stats FROM PUBLIC;
REVOKE ALL ON FUNCTION ca_website.get_or_compute_scraping_stats FROM PUBLIC;

-- Display confirmation
DO $$ 
BEGIN 
    RAISE NOTICE 'Scraping stats system created successfully:';
    RAISE NOTICE '- ca_website schema created';
    RAISE NOTICE '- scraping_stats table created for caching';
    RAISE NOTICE '- Smart caching with 5-minute threshold for current periods';
    RAISE NOTICE '- Private functions for secure computation';
    RAISE NOTICE '- get_stream_monitor_stats() for server-side access';
END 
$$;