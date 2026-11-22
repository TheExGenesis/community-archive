-- Search alerts health for Grafana: one row of aggregates, no ids, queries,
-- emails or user data. The hourly cron checks the stalest alerts first, so
-- any live alert unchecked for three hours means the cron is not running or
-- is failing. The daily email claims every unsent match, so one left unsent
-- for 36 hours means the email cron is not running. With no alerts the
-- feature is idle and healthy.
CREATE OR REPLACE FUNCTION "public"."community_archive_monitoring_search_alerts"()
RETURNS TABLE (
  "live_alerts" double precision,
  "stalest_check_age_seconds" double precision,
  "alerts_with_errors" double precision,
  "unsent_email_backlog_age_seconds" double precision,
  "healthy" double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH live AS (
    SELECT
      count(*) AS live_alerts,
      count(*) FILTER (WHERE a.last_error IS NOT NULL) AS alerts_with_errors,
      min(a.last_checked_at) AS stalest_checked_at
    FROM public.search_alerts AS a
    WHERE a.deleted_at IS NULL
  ), backlog AS (
    SELECT min(m.created_at) AS oldest_unsent_at
    FROM public.search_alert_matches AS m
    JOIN public.search_alerts AS a ON a.id = m.alert_id
    WHERE m.email_send_id IS NULL
      AND m.created_at > current_timestamp - interval '7 days'
      AND a.deleted_at IS NULL
      AND a.email_enabled
  ), ages AS (
    SELECT
      live.live_alerts,
      live.alerts_with_errors,
      greatest(
        coalesce(extract(epoch FROM (current_timestamp - live.stalest_checked_at)), 0),
        0
      ) AS stalest_check_age_seconds,
      greatest(
        coalesce(extract(epoch FROM (current_timestamp - backlog.oldest_unsent_at)), 0),
        0
      ) AS unsent_email_backlog_age_seconds
    FROM live, backlog
  )
  SELECT
    ages.live_alerts::double precision AS live_alerts,
    ages.stalest_check_age_seconds::double precision AS stalest_check_age_seconds,
    ages.alerts_with_errors::double precision AS alerts_with_errors,
    ages.unsent_email_backlog_age_seconds::double precision
      AS unsent_email_backlog_age_seconds,
    (
      ages.stalest_check_age_seconds <= 10800
      AND ages.unsent_email_backlog_age_seconds <= 129600
    )::integer::double precision AS healthy
  FROM ages;
$$;
ALTER FUNCTION "public"."community_archive_monitoring_search_alerts"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."community_archive_monitoring_search_alerts"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."community_archive_monitoring_search_alerts"()
  TO "readclient";
