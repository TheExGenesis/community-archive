-- Backfilled from prod's supabase_migrations.schema_migrations table.
-- Originally applied directly via Supabase SQL editor on 2026-04-04 (per the
-- version timestamp), not via this repo. Captured here so staging's db reset
-- gets these objects too. All statements are idempotent (CREATE OR REPLACE /
-- IF NOT EXISTS / wrapped DO blocks) so re-applying to prod is a no-op.
--
-- version:        20260404173000
-- name:           schedule_daily_global_activity_summary_refresh
-- statements:     4

-- statement 1/4
CREATE OR REPLACE FUNCTION "public"."refresh_global_activity_summary"() RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '20min'
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions'
    AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_activity_summary;
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%not populated%' THEN
                REFRESH MATERIALIZED VIEW public.global_activity_summary;
            ELSE
                RAISE;
            END IF;
    END;
END;
$$;

-- statement 2/4
ALTER FUNCTION "public"."refresh_global_activity_summary"() OWNER TO "postgres";

-- statement 3/4
DO $$
BEGIN
    BEGIN
        PERFORM cron.unschedule('refresh-global-activity-summary-daily');
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not unschedule refresh-global-activity-summary-daily: %', SQLERRM;
    END;
END
$$;

-- statement 4/4
SELECT cron.schedule(
    'refresh-global-activity-summary-daily',
    '15 5 * * *',
    $$SELECT public.refresh_global_activity_summary();$$
);
