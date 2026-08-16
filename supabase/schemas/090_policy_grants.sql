-- prod.sql preserves legacy grants for dump compatibility; policy-sensitive
-- objects are narrowed last so schema rebuilds cannot re-expose snapshots.
REVOKE ALL ON TABLE public.account_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON TABLE public.global_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;

REVOKE ALL ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON FUNCTION private.policy_authority_fingerprint()
  FROM PUBLIC, anon, authenticated, readclient, service_role;
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
REVOKE ALL ON FUNCTION private.reconcile_legacy_liked_tweets_batch(integer)
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE EXECUTE ON FUNCTION tes.search_liked_tweets(
  text, text, text, date, date, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION tes.get_followers()
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE EXECUTE ON FUNCTION tes.get_followings()
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE EXECUTE ON FUNCTION tes.get_moots()
  FROM PUBLIC, anon, authenticated, readclient;

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
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) TO anon, authenticated, service_role;

-- Legacy archive upload staging is retired. prod.sql retains the old function
-- definitions and grants for dump compatibility, so remove them last. DROP
-- without CASCADE makes an unexpected live dependency fail closed.
DO $retire_legacy_temp_functions$
DECLARE
  legacy_function record;
BEGIN
  FOR legacy_function IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'dev')
      AND procedure.proname IN (
        'process_archive',
        'process_and_insert_tweet_entities',
        'create_temp_tables',
        'drop_temp_tables',
        'commit_temp_data',
        'insert_temp_account',
        'insert_temp_archive_upload',
        'insert_temp_followers',
        'insert_temp_following',
        'insert_temp_likes',
        'insert_temp_profiles',
        'insert_temp_tweets'
      )
  LOOP
    EXECUTE format(
      'DROP FUNCTION %I.%I(%s)',
      legacy_function.schema_name,
      legacy_function.function_name,
      legacy_function.identity_arguments
    );
  END LOOP;
END;
$retire_legacy_temp_functions$;

-- Trigger functions are internal enforcement hooks, not RPCs. PostgreSQL
-- triggers do not require callers to retain direct EXECUTE on their functions.
DO $revoke_policy_trigger_rpc_access$
DECLARE
  trigger_function record;
BEGIN
  FOR trigger_function IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'apply_policy_block_tombstone',
        'capture_policy_block_username',
        'enforce_policy_account_tombstone',
        'enforce_policy_archive_object',
        'enforce_policy_liked_tweet_tombstone',
        'enforce_policy_mentioned_user_tombstone',
        'enforce_policy_tweet_tombstone',
        'log_archive_upload_event',
        'protect_policy_tombstone_delete',
        'reject_policy_blocked_account_detail',
        'reject_policy_blocked_json_payload',
        'reject_policy_tombstone_tweet_detail'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) '
      'FROM PUBLIC, anon, authenticated, readclient, service_role',
      trigger_function.schema_name,
      trigger_function.function_name,
      trigger_function.identity_arguments
    );
  END LOOP;
END;
$revoke_policy_trigger_rpc_access$;

REVOKE ALL PRIVILEGES ON SCHEMA temp
  FROM PUBLIC, anon, authenticated, readclient, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE ALL PRIVILEGES ON TABLES
  FROM PUBLIC, anon, authenticated, readclient, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM PUBLIC, anon, authenticated, readclient, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, readclient, service_role;
