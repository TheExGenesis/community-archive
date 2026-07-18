-- Service-role-only read bridge for the admin dashboard's recent archive
-- delete list. private.admin_jobs is intentionally not exposed through
-- PostgREST, so the server-rendered dashboard needs a narrow SECURITY DEFINER
-- function rather than direct table access.

CREATE OR REPLACE FUNCTION public.admin_list_recent_delete_jobs(
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  job_key uuid,
  status text,
  account_id text,
  username text,
  reason text,
  created_at timestamptz,
  updated_at timestamptz,
  error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    j.key AS job_key,
    j.status,
    j.args->>'account_id' AS account_id,
    j.args->>'username' AS username,
    j.args->>'reason' AS reason,
    j.created_at,
    j.updated_at,
    j.args->>'error' AS error
  FROM private.admin_jobs AS j
  WHERE j.job_name = 'admin_delete_with_export'
  ORDER BY j.updated_at DESC, j.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

ALTER FUNCTION public.admin_list_recent_delete_jobs(integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_list_recent_delete_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_recent_delete_jobs(integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_list_recent_delete_jobs(integer) IS
  'Returns recent admin archive-delete jobs for the service-role-gated admin dashboard.';
