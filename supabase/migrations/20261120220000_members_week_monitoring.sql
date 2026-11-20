-- Weekly member joins for the Grafana exporter role, from the member directory.
-- The existing activity function counts user_action_log rows, which most
-- opt-in paths never write (230 logged opt-ins against 2,776 members on
-- 2026-11-20). This one reads joined_at from public.user_directory, the same
-- relation the member count uses, so every current member is counted in the
-- week they joined. Aggregate-only: no account, username or date below a week
-- leaves the database. Members who later left are not in the directory, so
-- past weeks describe today's members, not the count as it stood then.
CREATE OR REPLACE FUNCTION private.community_archive_monitoring_members_week(
  p_weeks integer DEFAULT 26
)
RETURNS TABLE (
  member_week text,
  week_start_date text,
  joined_with_archive double precision,
  joined_optin_only double precision,
  members_total double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_weeks integer := LEAST(GREATEST(COALESCE(p_weeks, 26), 1), 104);
BEGIN
  IF session_user <> 'archive_metrics_exporter' THEN
    RAISE EXCEPTION 'monitoring function is restricted'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH members AS MATERIALIZED (
    SELECT
      date_trunc('week', directory.joined_at AT TIME ZONE 'UTC') AS week_start,
      directory.has_archive
    FROM public.user_directory AS directory
  ), weeks AS (
    SELECT generate_series(
      date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        - ((v_weeks - 1) * INTERVAL '1 week'),
      date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
      INTERVAL '1 week'
    ) AS week_start
  ), weekly AS (
    SELECT
      members.week_start,
      COUNT(*) FILTER (WHERE members.has_archive) AS with_archive,
      COUNT(*) FILTER (WHERE NOT members.has_archive) AS optin_only
    FROM members
    GROUP BY members.week_start
  )
  SELECT
    to_char(weeks.week_start, 'IYYY-"W"IW'),
    to_char(weeks.week_start, 'YYYY-MM-DD'),
    COALESCE(weekly.with_archive, 0)::double precision,
    COALESCE(weekly.optin_only, 0)::double precision,
    (
      SELECT COUNT(*) FROM members
      WHERE members.week_start <= weeks.week_start
    )::double precision
  FROM weeks
  LEFT JOIN weekly ON weekly.week_start = weeks.week_start
  ORDER BY weeks.week_start;
END;
$$;
ALTER FUNCTION private.community_archive_monitoring_members_week(integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_members_week(integer)
  FROM PUBLIC, anon, authenticated, readclient, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'archive_metrics_exporter'
  ) THEN
    GRANT EXECUTE
      ON FUNCTION private.community_archive_monitoring_members_week(integer)
      TO archive_metrics_exporter;
  END IF;
END;
$$;
