-- Restore pg_cron extension and all cron jobs that were removed
-- This migration fixes the issue caused by dropping pg_cron CASCADE

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- ==========================================
-- 1. Restore process_jobs cron job
-- ==========================================
-- First check if it already exists and remove if it does (defensive approach)
DO $$
BEGIN
    -- Try to unschedule existing process_jobs but ignore errors
    BEGIN
        PERFORM cron.unschedule(j.jobid) 
        FROM cron.job j 
        WHERE j.command LIKE '%SELECT private.process_jobs();%';
    EXCEPTION 
        WHEN OTHERS THEN
            -- Log the error but don't fail the migration
            RAISE NOTICE 'Could not unschedule existing process_jobs: %', SQLERRM;
    END;
END
$$;

-- Schedule process_jobs to run every minute
SELECT cron.schedule(
    'process-jobs',
    '* * * * *',
    $$SELECT private.process_jobs();$$
);

-- ==========================================
-- 2. Restore TES (Twitter Extension Service) cron jobs
-- ==========================================

-- Enable pg_net extension (required for TES)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing TES jobs if they exist (defensive approach)
DO $$
BEGIN
    -- Try to remove tes-invoke-edge-function-scheduler but ignore errors
    BEGIN
        PERFORM cron.unschedule('tes-invoke-edge-function-scheduler');
    EXCEPTION 
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not unschedule tes-invoke-edge-function-scheduler: %', SQLERRM;
    END;
    
    -- Try to remove tes-insert-temporary-data-into-tables but ignore errors
    BEGIN
        PERFORM cron.unschedule('tes-insert-temporary-data-into-tables');
    EXCEPTION 
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not unschedule tes-insert-temporary-data-into-tables: %', SQLERRM;
    END;
END
$$;

-- Schedule TES edge function invocation (runs every minute)
SELECT cron.schedule(
    'tes-invoke-edge-function-scheduler',
    '* * * * *', 
    $$SELECT private.tes_invoke_edge_function_move_data_to_storage();$$
);

-- Schedule TES temporary data import (runs every minute)
SELECT cron.schedule(
    'tes-insert-temporary-data-into-tables', 
    '* * * * *', 
    $$SELECT private.tes_import_temporary_data_into_tables();$$
);

-- ==========================================
-- 3. Restore scraping stats background job
-- ==========================================

-- Remove existing job if it exists (more defensive approach)
DO $$
BEGIN
    -- Try to unschedule but ignore errors if the job doesn't exist or cron is broken
    BEGIN
        PERFORM cron.unschedule('mark-completed-scraping-periods');
    EXCEPTION 
        WHEN OTHERS THEN
            -- Log the error but don't fail the migration
            RAISE NOTICE 'Could not unschedule mark-completed-scraping-periods: %', SQLERRM;
    END;
END
$$;

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

-- ==========================================
-- Confirmation
-- ==========================================
DO $$ 
BEGIN 
    RAISE NOTICE 'Cron jobs successfully restored:';
    RAISE NOTICE '1. process-jobs - Runs every minute';
    RAISE NOTICE '2. tes-invoke-edge-function-scheduler - Runs every minute';
    RAISE NOTICE '3. tes-insert-temporary-data-into-tables - Runs every minute';
    RAISE NOTICE '4. mark-completed-scraping-periods - Runs every hour';
    RAISE NOTICE '';
    RAISE NOTICE 'All cron jobs have been re-enabled and are now active.';
END 
$$;