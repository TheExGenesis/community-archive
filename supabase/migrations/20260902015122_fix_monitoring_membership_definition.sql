-- The public directory is the canonical, deduplicated membership projection:
-- completed archive upload OR explicit opt-in, with explicit opt-out winning.
-- The previous monitoring bridge counted explicit opt-ins only.
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
  SELECT COUNT(*)::double precision
  FROM public.user_directory;
END;
$$;
ALTER FUNCTION private.community_archive_monitoring_membership() OWNER TO postgres;
