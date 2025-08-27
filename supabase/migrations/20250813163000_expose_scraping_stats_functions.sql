-- Create public wrapper functions to expose ca_website functions to PostgREST

-- Wrapper for get_hourly_scraping_stats
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

-- Wrapper for compute_hourly_scraping_stats (for testing)
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

-- Also ensure the scraping_stats table can be accessed (read-only)
GRANT SELECT ON ca_website.scraping_stats TO authenticated;