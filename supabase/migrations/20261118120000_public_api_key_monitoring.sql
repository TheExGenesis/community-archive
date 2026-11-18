-- Aggregate-only counts of public API consumers and keys for the Grafana
-- exporter role. No key ID, consumer ID, label, or owner leaves the database.
CREATE OR REPLACE FUNCTION private.community_archive_monitoring_public_api_keys()
RETURNS TABLE (
  consumers double precision,
  suspended_consumers double precision,
  consumers_with_active_key double precision,
  active_keys double precision,
  revoked_keys double precision,
  expired_keys double precision,
  active_keys_never_used double precision,
  active_keys_used_24h double precision,
  active_keys_used_7d double precision,
  active_keys_used_30d double precision,
  keys_created_24h double precision,
  keys_created_7d double precision,
  keys_created_30d double precision
)
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

  -- A key is active when the gateway would accept it: not revoked, not
  -- expired, and owned by an active consumer. last_used_at is approximate
  -- (refreshed on gateway re-verification), which is enough for day windows.
  RETURN QUERY
  WITH keys AS (
    SELECT
      k.consumer_id,
      k.created_at,
      k.last_used_at,
      CASE
        WHEN k.revoked_at IS NOT NULL THEN 'revoked'
        WHEN k.expires_at IS NOT NULL AND k.expires_at <= now() THEN 'expired'
        WHEN c.status <> 'active' THEN 'suspended'
        ELSE 'active'
      END AS state
    FROM private.public_api_keys AS k
    JOIN private.public_api_consumers AS c ON c.id = k.consumer_id
  )
  SELECT
    (SELECT COUNT(*) FROM private.public_api_consumers)::double precision,
    (SELECT COUNT(*) FROM private.public_api_consumers AS c
      WHERE c.status = 'suspended')::double precision,
    COUNT(DISTINCT keys.consumer_id) FILTER (WHERE keys.state = 'active')::double precision,
    COUNT(*) FILTER (WHERE keys.state = 'active')::double precision,
    COUNT(*) FILTER (WHERE keys.state = 'revoked')::double precision,
    COUNT(*) FILTER (WHERE keys.state = 'expired')::double precision,
    COUNT(*) FILTER (
      WHERE keys.state = 'active' AND keys.last_used_at IS NULL
    )::double precision,
    COUNT(*) FILTER (
      WHERE keys.state = 'active' AND keys.last_used_at > now() - interval '24 hours'
    )::double precision,
    COUNT(*) FILTER (
      WHERE keys.state = 'active' AND keys.last_used_at > now() - interval '7 days'
    )::double precision,
    COUNT(*) FILTER (
      WHERE keys.state = 'active' AND keys.last_used_at > now() - interval '30 days'
    )::double precision,
    COUNT(*) FILTER (WHERE keys.created_at > now() - interval '24 hours')::double precision,
    COUNT(*) FILTER (WHERE keys.created_at > now() - interval '7 days')::double precision,
    COUNT(*) FILTER (WHERE keys.created_at > now() - interval '30 days')::double precision
  FROM keys;
END;
$$;
ALTER FUNCTION private.community_archive_monitoring_public_api_keys() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_public_api_keys()
  FROM PUBLIC, anon, authenticated, readclient, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'archive_metrics_exporter'
  ) THEN
    GRANT EXECUTE
      ON FUNCTION private.community_archive_monitoring_public_api_keys()
      TO archive_metrics_exporter;
  END IF;
END;
$$;
