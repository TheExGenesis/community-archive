-- public.admin_enqueue_delete_with_export(p_account_id, p_username,
--                                          p_reason, p_requested_by_user_id)
--
-- Single named entry point for Vercel's adminOptOutAccount(...) server
-- action to hand a delete-with-export job off to the Hetzner worker.
--
-- Why an RPC and not a direct INSERT?
--
-- private.admin_jobs lives in the `private` schema, which is
-- deliberately NOT exposed via PostgREST (Supabase config). The Vercel
-- service-role client talks to Postgres exclusively through PostgREST,
-- so the only way to write to a private table is via a SECURITY
-- DEFINER function in the public schema. This RPC is that bridge,
-- with a narrow contract (validates args, sets a fixed job_name) so
-- the surface area stays small.
--
-- Returns the new admin_jobs.key (UUID) so the caller can record it
-- on the optin row / user_action_log / response message for triage.

CREATE OR REPLACE FUNCTION public.admin_enqueue_delete_with_export(
  p_account_id          text,
  p_username            text,
  p_reason              text DEFAULT NULL,
  p_requested_by_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key uuid;
BEGIN
  -- Input validation — the worker filters on (job_name, account_id,
  -- username) for forensics, so we hard-require both.
  IF p_account_id IS NULL OR p_account_id = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;
  IF p_username IS NULL OR p_username = '' THEN
    RAISE EXCEPTION 'p_username is required';
  END IF;

  INSERT INTO private.admin_jobs (job_name, status, args)
  VALUES (
    'admin_delete_with_export',
    'QUEUED',
    jsonb_build_object(
      'account_id',          p_account_id,
      'username',            p_username,
      'reason',              COALESCE(p_reason, 'Admin manual opt-out'),
      'requested_by_user_id', p_requested_by_user_id,
      -- Wire-format match for what the worker reads — ExportArgs.enqueuedAt
      -- becomes the timestamp prefix on the export folder.
      'enqueued_at',         to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
  )
  RETURNING key INTO v_key;

  RETURN v_key;
END;
$$;

ALTER FUNCTION public.admin_enqueue_delete_with_export(text, text, text, uuid)
  OWNER TO postgres;

-- Lock the surface area: anon and authenticated must NEVER be able to
-- call this directly. Only the service-role JWT (used by Vercel's
-- adminOptOutAccount server action behind requireAdmin()) can.
REVOKE ALL ON FUNCTION public.admin_enqueue_delete_with_export(text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_delete_with_export(text, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.admin_enqueue_delete_with_export(text, text, text, uuid) IS
  'Vercel-side entry point for queuing an admin delete-with-export job. '
  'Inserts a row into private.admin_jobs (which is not PostgREST-exposed), '
  'so the Hetzner admin-delete-worker can claim it. Returns the job key.';
