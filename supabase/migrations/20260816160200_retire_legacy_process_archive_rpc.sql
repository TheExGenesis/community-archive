-- The legacy JSON RPCs write through the retired temp-schema staging pipeline.
-- Remove them entirely and make trigger-only policy helpers non-callable over
-- PostgREST. Triggers continue to execute their functions as normal.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $drop_legacy_process_archive$
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
        'process_and_insert_tweet_entities'
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
$drop_legacy_process_archive$;

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

COMMIT;
