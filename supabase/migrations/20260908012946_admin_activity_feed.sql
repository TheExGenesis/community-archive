-- Private dashboard read. No consent or archive data is changed by this function.
CREATE OR REPLACE FUNCTION public.admin_activity_page(
  p_before_at timestamptz DEFAULT NULL,
  p_before_id text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 26
) RETURNS TABLE (
  id text, kind text, occurred_at timestamptz, account_id text, username text,
  status text, detail text, reason text, error text, date_basis text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin service access required' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('archive_upload','opt_in','opt_out','archive_delete') THEN
    RAISE EXCEPTION 'Invalid activity type' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_search, '')) > 64 OR length(COALESCE(p_before_id, '')) > 100 THEN
    RAISE EXCEPTION 'Invalid activity filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH events AS (
    SELECT 'upload:' || a.id::text AS id, 'archive_upload'::text AS kind,
      a.created_at AS occurred_at, a.account_id, a.username,
      COALESCE(a.upload_phase::text, 'unknown') AS status,
      'Archive upload #' || a.id::text AS detail,
      NULL::text AS reason, NULL::text AS error, 'received'::text AS date_basis
    FROM public.archive_upload a
    UNION ALL
    SELECT 'optin:' || o.id::text, 'opt_in', COALESCE(o.opted_in_at, o.created_at),
      o.twitter_user_id, o.username, 'Opted in', 'Currently opted in', NULL, NULL,
      CASE WHEN o.opted_in_at IS NOT NULL THEN 'opted in' ELSE 'record created' END
    FROM public.optin o WHERE o.opted_in AND NOT COALESCE(o.explicit_optout, false)
    UNION ALL
    SELECT 'optout:' || o.id::text, 'opt_out', COALESCE(o.opted_out_at, o.updated_at, o.created_at),
      o.twitter_user_id, o.username, 'Opted out', 'Currently explicitly opted out', o.opt_out_reason, NULL,
      CASE WHEN o.opted_out_at IS NOT NULL THEN 'opted out'
        WHEN o.updated_at IS NOT NULL THEN 'record updated' ELSE 'record created' END
    FROM public.optin o WHERE o.explicit_optout
    UNION ALL
    SELECT 'job:' || j.key::text, 'archive_delete', j.created_at,
      j.args->>'account_id', j.args->>'username',
      CASE j.status::text WHEN 'DONE' THEN 'Deleted' WHEN 'FAILED' THEN 'Failed'
        WHEN 'QUEUED' THEN 'Queued' WHEN 'PROCESSING' THEN 'Processing' ELSE 'Unknown' END,
      'Admin archive deletion', j.args->>'reason', j.args->>'error', 'requested'
    FROM private.admin_jobs j WHERE j.job_name = 'admin_delete_with_export'
    UNION ALL
    SELECT 'action:' || l.id::text,
      CASE WHEN l.action_type = 'archive_upload' THEN 'archive_upload'
        WHEN l.action_type = 'opt_in' THEN 'opt_in'
        WHEN l.action_type IN ('opt_out_only','opt_out_streaming') THEN 'opt_out'
        ELSE 'archive_delete' END,
      l.created_at, l.account_id, COALESCE(o.username, a.username), 'Logged',
      CASE l.action_type WHEN 'delete_archive' THEN 'Self-service archive deletion'
        WHEN 'opt_out_and_delete' THEN 'Self-service deletion and opt-out'
        WHEN 'archive_upload' THEN 'Completed archive upload (upload record no longer present)'
        WHEN 'opt_in' THEN 'Self-service opt-in report; current status may differ'
        WHEN 'opt_out_only' THEN 'Self-service opt-out report; current status may differ'
        WHEN 'opt_out_streaming' THEN 'Self-service streaming opt-out report; current status may differ'
        ELSE 'Self-service deletion of all archives' END,
      NULL, NULL, 'logged'
    FROM public.user_action_log l
    LEFT JOIN LATERAL (
      SELECT opt.username FROM public.optin opt WHERE opt.twitter_user_id = l.account_id
      ORDER BY opt.created_at DESC NULLS LAST, opt.id LIMIT 1
    ) o ON true
    LEFT JOIN public.all_account a ON a.account_id = l.account_id
    WHERE l.action_type IN ('delete_archive','delete_all_archives','opt_out_and_delete','opt_in','opt_out_only','opt_out_streaming')
       OR (l.action_type = 'archive_upload' AND NOT EXISTS (
         SELECT 1 FROM public.archive_upload u WHERE u.id::text = l.metadata->>'archive_upload_id'
       ))
  )
  SELECT e.id, e.kind, e.occurred_at, e.account_id, e.username,
    e.status, e.detail, e.reason, e.error, e.date_basis
  FROM events e
  WHERE (p_kind IS NULL OR e.kind = p_kind)
    AND (COALESCE(p_search, '') = ''
      OR strpos(lower(COALESCE(e.username, '')), lower(ltrim(p_search, '@'))) > 0
      OR e.account_id = p_search)
    AND (p_before_id IS NULL OR
      (COALESCE(e.occurred_at, '-infinity'::timestamptz), e.id COLLATE "C") <
      (COALESCE(p_before_at, '-infinity'::timestamptz), p_before_id COLLATE "C"))
  ORDER BY e.occurred_at DESC NULLS LAST, e.id COLLATE "C" DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 26), 1), 51);
END;
$$;
ALTER FUNCTION public.admin_activity_page(timestamptz, text, text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_activity_page(timestamptz, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_page(timestamptz, text, text, text, integer) TO service_role;
