-- Restrict public.refresh_global_activity_summary() to service_role.
--
-- The function is SECURITY DEFINER with a 20-minute statement_timeout and
-- runs REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_activity_summary.
-- 20260404173000_schedule_daily_global_activity_summary_refresh.sql created
-- it before the secure-by-default privileges in
-- 20260611000000_harden_rls_writes.sql, so it kept the default EXECUTE grants
-- to PUBLIC, anon, authenticated, and service_role. Any anonymous PostgREST
-- caller could start an expensive refresh.
--
-- Its only intended caller is the pg_cron job
-- 'refresh-global-activity-summary-daily', which runs as the job owner
-- (postgres). postgres owns the function, so it keeps EXECUTE.

REVOKE ALL ON FUNCTION public.refresh_global_activity_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_global_activity_summary() TO service_role;
