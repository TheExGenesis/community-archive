-- Fix functions to use correct API types for streaming tweets
-- Based on investigation: api_home-timeline, api_user-tweets are the streaming types

-- Drop and recreate with correct type filters
DROP FUNCTION IF EXISTS public.get_streaming_stats_hourly CASCADE;
DROP FUNCTION IF EXISTS public.get_streaming_stats_daily CASCADE;  
DROP FUNCTION IF EXISTS public.get_streaming_stats_weekly CASCADE;
DROP FUNCTION IF EXISTS public.get_streaming_stats CASCADE;

-- Function for hourly stats from temporary_data (all API streaming data)
CREATE OR REPLACE FUNCTION public.get_streaming_stats_hourly(
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
SET search_path = public
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
            date_trunc('hour', td.inserted) as hour,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT td.user_id)::integer as unique_scrapers
        FROM public.temporary_data td
        WHERE td.inserted >= p_start_date 
          AND td.inserted < p_end_date
          AND td.type LIKE 'api_%'  -- All API types (home-timeline, user-tweets, etc)
          AND td.inserted IS NOT NULL
        GROUP BY date_trunc('hour', td.inserted)
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM hours h
    LEFT JOIN stats s ON s.hour = h.hour_start
    ORDER BY h.hour_start;
END;
$$;

-- Function for daily stats
CREATE OR REPLACE FUNCTION public.get_streaming_stats_daily(
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
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT 
            date_trunc('day', d) as day_start,
            date_trunc('day', d) + interval '1 day' as day_end
        FROM generate_series(
            date_trunc('day', p_start_date),
            date_trunc('day', p_end_date),
            interval '1 day'
        ) d
    ),
    stats AS (
        SELECT
            date_trunc('day', td.inserted) as day,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT td.user_id)::integer as unique_scrapers
        FROM public.temporary_data td
        WHERE td.inserted >= p_start_date 
          AND td.inserted < p_end_date
          AND td.type LIKE 'api_%'
          AND td.inserted IS NOT NULL
        GROUP BY date_trunc('day', td.inserted)
    )
    SELECT
        d.day_start as period_start,
        d.day_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM days d
    LEFT JOIN stats s ON s.day = d.day_start
    ORDER BY d.day_start;
END;
$$;

-- Function for weekly stats
CREATE OR REPLACE FUNCTION public.get_streaming_stats_weekly(
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
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH weeks AS (
        SELECT 
            date_trunc('week', w) as week_start,
            date_trunc('week', w) + interval '1 week' as week_end
        FROM generate_series(
            date_trunc('week', p_start_date),
            date_trunc('week', p_end_date),
            interval '1 week'
        ) w
    ),
    stats AS (
        SELECT
            date_trunc('week', td.inserted) as week,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT td.user_id)::integer as unique_scrapers
        FROM public.temporary_data td
        WHERE td.inserted >= p_start_date 
          AND td.inserted < p_end_date
          AND td.type LIKE 'api_%'
          AND td.inserted IS NOT NULL
        GROUP BY date_trunc('week', td.inserted)
    )
    SELECT
        w.week_start as period_start,
        w.week_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM weeks w
    LEFT JOIN stats s ON s.week = w.week_start
    ORDER BY w.week_start;
END;
$$;

-- Combined function
CREATE OR REPLACE FUNCTION public.get_streaming_stats(
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone,
    p_granularity text DEFAULT 'hour'
)
RETURNS TABLE(
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    tweet_count bigint,
    unique_scrapers integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_granularity = 'hour' THEN
        RETURN QUERY SELECT * FROM public.get_streaming_stats_hourly(p_start_date, p_end_date);
    ELSIF p_granularity = 'day' THEN
        RETURN QUERY SELECT * FROM public.get_streaming_stats_daily(p_start_date, p_end_date);
    ELSIF p_granularity = 'week' THEN
        RETURN QUERY SELECT * FROM public.get_streaming_stats_weekly(p_start_date, p_end_date);
    ELSE
        RAISE EXCEPTION 'Invalid granularity: %. Must be hour, day, or week', p_granularity;
    END IF;
END;
$$;

-- Grant execute only to service role
REVOKE ALL ON FUNCTION public.get_streaming_stats_hourly FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_streaming_stats_daily FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_streaming_stats_weekly FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_streaming_stats FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_streaming_stats_hourly TO service_role;
GRANT EXECUTE ON FUNCTION public.get_streaming_stats_daily TO service_role;
GRANT EXECUTE ON FUNCTION public.get_streaming_stats_weekly TO service_role;
GRANT EXECUTE ON FUNCTION public.get_streaming_stats TO service_role;