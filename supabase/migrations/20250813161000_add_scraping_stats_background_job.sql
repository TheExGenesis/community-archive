-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create background job to mark completed periods and precompute stats
-- This runs every hour to mark periods as complete and optionally precompute upcoming periods
SELECT cron.schedule(
    'mark-completed-scraping-periods',
    '0 * * * *', -- Run at the start of every hour
    $$
    -- Mark completed periods as is_complete = true
    SELECT ca_website.mark_completed_periods();
    
    -- Optionally precompute stats for the last 48 hours to keep cache warm
    -- This ensures smooth user experience without waiting for computation
    SELECT ca_website.get_or_compute_scraping_stats(
        now() - interval '48 hours',
        now(),
        'hour'::ca_website.period_type
    );
    
    -- Also compute daily stats for the last week
    SELECT ca_website.get_or_compute_scraping_stats(
        date_trunc('day', now() - interval '7 days'),
        date_trunc('day', now() + interval '1 day'),
        'day'::ca_website.period_type
    );
    $$
);

-- Create a function to manually refresh stats (useful for testing and manual triggers)
CREATE OR REPLACE FUNCTION ca_website.refresh_scraping_stats(
    p_hours_back integer DEFAULT 48,
    p_days_back integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hour_count integer;
    v_day_count integer;
    v_result jsonb;
BEGIN
    -- Refresh hourly stats
    SELECT COUNT(*)
    INTO v_hour_count
    FROM ca_website.get_or_compute_scraping_stats(
        now() - (p_hours_back || ' hours')::interval,
        now(),
        'hour'::ca_website.period_type
    );
    
    -- Refresh daily stats
    SELECT COUNT(*)
    INTO v_day_count
    FROM ca_website.get_or_compute_scraping_stats(
        date_trunc('day', now() - (p_days_back || ' days')::interval),
        date_trunc('day', now() + interval '1 day'),
        'day'::ca_website.period_type
    );
    
    -- Mark completed periods
    PERFORM ca_website.mark_completed_periods();
    
    v_result := jsonb_build_object(
        'success', true,
        'hourly_periods_refreshed', v_hour_count,
        'daily_periods_refreshed', v_day_count,
        'refreshed_at', now()
    );
    
    RETURN v_result;
END;
$$;

-- Grant execute permission on refresh function to authenticated users (for admin use)
GRANT EXECUTE ON FUNCTION ca_website.refresh_scraping_stats TO authenticated;

-- Display confirmation
DO $$ 
BEGIN 
    RAISE NOTICE 'Background job for scraping stats created:';
    RAISE NOTICE '- Runs every hour to mark completed periods';
    RAISE NOTICE '- Precomputes stats for last 48 hours (hourly)';
    RAISE NOTICE '- Precomputes stats for last 7 days (daily)';
    RAISE NOTICE '- Manual refresh available via refresh_scraping_stats()';
END 
$$;