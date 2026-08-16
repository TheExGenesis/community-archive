-- prod.sql preserves legacy grants for dump compatibility; policy-sensitive
-- objects are narrowed last so schema rebuilds cannot re-expose snapshots.
REVOKE ALL ON TABLE public.account_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;

REVOKE ALL ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.policy_blocked_account_id(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_policy_account(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_upload_is_allowed(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_archive_upload_allowed(text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.policy_account_is_blocked(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.policy_blocked_account_id(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_policy_account(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_archive_upload_allowed(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  TO service_role;
