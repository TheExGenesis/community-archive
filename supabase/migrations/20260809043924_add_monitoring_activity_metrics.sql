-- Private, aggregate-only monitoring bridges for the least-privilege
-- archive_metrics_exporter role. The functions intentionally expose no user,
-- account, archive, or free-form metadata labels.

CREATE OR REPLACE FUNCTION private.community_archive_monitoring_membership()
RETURNS TABLE (currently_opted_in double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF session_user <> 'archive_metrics_exporter' THEN
    RAISE EXCEPTION 'monitoring function is restricted'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT COUNT(*) FILTER (
    WHERE opted_in IS TRUE
      AND explicit_optout IS NOT TRUE
  )::double precision
  FROM public.optin;
END;
$$;
ALTER FUNCTION private.community_archive_monitoring_membership() OWNER TO postgres;

CREATE OR REPLACE FUNCTION private.community_archive_monitoring_activity_day(
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  activity_day text,
  activity text,
  events double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 90), 1), 180);
BEGIN
  IF session_user <> 'archive_metrics_exporter' THEN
    RAISE EXCEPTION 'monitoring function is restricted'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        - ((v_days - 1) * INTERVAL '1 day'),
      date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
      INTERVAL '1 day'
    ) AS day_start
  ), daily AS (
    SELECT
      date_trunc('day', created_at AT TIME ZONE 'UTC') AS day_start,
      COUNT(*) FILTER (
        WHERE action_type = 'opt_in'
      )::double precision AS opt_ins,
      COUNT(*) FILTER (
        WHERE action_type LIKE 'opt_out%'
      )::double precision AS opt_outs
    FROM public.user_action_log
    WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP)
      - ((v_days - 1) * INTERVAL '1 day')
    GROUP BY 1
  )
  SELECT
    to_char(days.day_start, 'YYYY-MM-DD') AS activity_day,
    daily_activity.activity,
    daily_activity.events
  FROM days
  LEFT JOIN daily USING (day_start)
  CROSS JOIN LATERAL (
    VALUES
      ('opt_in'::text, COALESCE(daily.opt_ins, 0)),
      ('opt_out'::text, COALESCE(daily.opt_outs, 0))
  ) AS daily_activity(activity, events)
  ORDER BY days.day_start, daily_activity.activity;
END;
$$;
ALTER FUNCTION private.community_archive_monitoring_activity_day(integer)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION private.community_archive_monitoring_membership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_activity_day(integer)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'archive_metrics_exporter'
  ) THEN
    REVOKE SELECT ON public.optin, public.user_action_log
      FROM archive_metrics_exporter;
    GRANT USAGE ON SCHEMA private TO archive_metrics_exporter;
    GRANT EXECUTE
      ON FUNCTION private.community_archive_monitoring_membership()
      TO archive_metrics_exporter;
    GRANT EXECUTE
      ON FUNCTION private.community_archive_monitoring_activity_day(integer)
      TO archive_metrics_exporter;
  END IF;
END;
$$;
